/// <reference lib="webworker" />

import type { UsbToDspMessage, DspToMainMessage, MainToDspMessage } from '$lib/workers/worker-messages';
import { getRingBufferReader } from './ring-buffer';
import { FftProcessor } from './fft-processor';
import { DemodProcessor } from './demod-processor';
import { FrameSyncDetector } from '$lib/protocol/frame-sync';
import { decodeCommand } from '$lib/protocol/gen2-decoder';
import { InventoryTracker } from '$lib/protocol/inventory-tracker';
import type { DecodedCommandMsg, RoundUpdate } from '$lib/protocol/gen2-types';
import { STATS_REPORT_INTERVAL_MS } from '$lib/usb/usb-types';
import type { RingBuffer } from 'ringbuf.js';

declare const self: DedicatedWorkerGlobalScope;

// --- Worker state ---
let ringReader: RingBuffer | null = null;
let polling = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

// --- FFT processing state ---
let fftProcessor: FftProcessor | null = null;
let currentSampleRate = 0;
let currentCenterFrequency = 0;
let currentFftSize = 1024;

/** Staging buffer for accumulating IQ bytes until we have fftSize samples. */
let stagingBuffer = new Uint8Array(2048 * 2); // max FFT size * 2 bytes per sample
let stagingOffset = 0;

// --- Demod processing state ---
let demodProcessor: DemodProcessor | null = null;
let frameSyncDetector: FrameSyncDetector | null = null;
let inventoryTracker: InventoryTracker | null = null;
let globalSampleOffset = 0;
let decodedCommandBatch: DecodedCommandMsg[] = [];
let roundUpdateBatch: RoundUpdate[] = [];
let decodeStatsTotal = 0;
let decodeStatsCrcChecked = 0;
let decodeStatsCrcPassed = 0;
let lastDecodeStatsReport = 0;
let lastDecodeCommandsSend = 0;
const DECODE_BATCH_INTERVAL_MS = 100; // send decoded commands every 100ms

// --- Debug counters for noise rejection pipeline ---
let dbgSymbolChunks = 0;
let dbgSyncsFound = 0;
let dbgTooFewBits = 0;
let dbgCrcRejected = 0;
let dbgBitCountRejected = 0;
let dbgCommandsPassed = 0;
let dbgLastReport = 0;
const DBG_REPORT_INTERVAL_MS = 2000;

// --- Stats ---
let totalSamplesProcessed = 0;
let lastStatsReport = 0;

/** DSP polling interval in ms. */
const DSP_POLL_INTERVAL_MS = 10;

/** Read buffer -- reused to avoid allocation. */
const READ_BUFFER = new Uint8Array(16384);

/**
 * Post a typed message to the main thread.
 */
function postToMain(msg: DspToMainMessage, transfer?: Transferable[]): void {
	if (transfer) {
		self.postMessage(msg, transfer);
	} else {
		self.postMessage(msg);
	}
}

/**
 * Poll the ring buffer for available IQ data.
 * Reads IQ data, accumulates in staging buffer, and runs FFT when enough samples collected.
 */
function pollRingBuffer(): void {
	if (!polling || !ringReader) return;

	// Read all available data from ring buffer
	let totalRead = 0;
	let read: number;
	do {
		read = ringReader.pop(READ_BUFFER);
		if (read > 0) {
			totalRead += read;

			// Process FFT if processor is available
			if (fftProcessor) {
				processFftData(READ_BUFFER, read);
			}

			// Parallel demod path
			if (demodProcessor) {
				processDemodData(READ_BUFFER, read);
			}
		}
	} while (read === READ_BUFFER.length);

	if (totalRead > 0) {
		// Each IQ sample is 2 bytes (I + Q)
		totalSamplesProcessed += totalRead / 2;
	}

	// Report stats periodically
	const now = Date.now();
	if (now - lastStatsReport >= STATS_REPORT_INTERVAL_MS) {
		lastStatsReport = now;
		postToMain({
			type: 'dsp-stats',
			samplesProcessed: totalSamplesProcessed,
		});

		// Send decode stats alongside dsp-stats
		if (demodProcessor && decodeStatsTotal > 0) {
			const elapsed = (now - lastDecodeStatsReport) / 1000;
			postToMain({
				type: 'decode-stats',
				totalCommands: decodeStatsTotal,
				crcPassRate: decodeStatsCrcChecked > 0 ? decodeStatsCrcPassed / decodeStatsCrcChecked : 1,
				commandsPerSec: elapsed > 0 ? decodeStatsTotal / elapsed : 0,
				detectedTari: frameSyncDetector ? frameSyncDetector.getLastTariUs() : 0,
			});
		}
	}

	// Send decoded commands periodically
	if (decodedCommandBatch.length > 0 && now - lastDecodeCommandsSend >= DECODE_BATCH_INTERVAL_MS) {
		lastDecodeCommandsSend = now;
		postToMain({
			type: 'decoded-commands',
			commands: decodedCommandBatch,
			roundUpdates: roundUpdateBatch,
		});
		decodedCommandBatch = [];
		roundUpdateBatch = [];
	}

	// Schedule next poll
	if (polling) {
		pollTimer = setTimeout(pollRingBuffer, DSP_POLL_INTERVAL_MS);
	}
}

/**
 * Accumulate IQ bytes in staging buffer and run FFT when we have fftSize samples.
 */
function processFftData(buffer: Uint8Array, bytesRead: number): void {
	if (!fftProcessor) return;

	const bytesPerBlock = currentFftSize * 2; // 2 bytes per IQ sample
	let bufferPos = 0;

	while (bufferPos < bytesRead) {
		// How many bytes we still need to fill the staging buffer
		const needed = bytesPerBlock - stagingOffset;
		const available = bytesRead - bufferPos;
		const toCopy = Math.min(needed, available);

		// Copy into staging buffer
		stagingBuffer.set(
			buffer.subarray(bufferPos, bufferPos + toCopy),
			stagingOffset,
		);
		stagingOffset += toCopy;
		bufferPos += toCopy;

		// If staging buffer is full, run FFT
		if (stagingOffset >= bytesPerBlock) {
			const spectrum = fftProcessor.process(stagingBuffer, 0, currentFftSize);

			// Copy result for transferable postMessage
			const spectrumCopy = new Float32Array(spectrum.length);
			spectrumCopy.set(spectrum);
			postToMain(
				{
					type: 'fft-data',
					bins: spectrumCopy,
					binCount: currentFftSize,
					centerFrequency: currentCenterFrequency,
					sampleRate: currentSampleRate,
				},
				[spectrumCopy.buffer],
			);

			stagingOffset = 0;
		}
	}
}

/**
 * Process IQ data through the demod pipeline: WASM envelope -> frame sync -> command decode -> inventory tracking.
 */
function processDemodData(buffer: Uint8Array, bytesRead: number): void {
	if (!demodProcessor || !frameSyncDetector) return;

	// Run WASM envelope detector
	const symbols = demodProcessor.process(buffer, bytesRead, currentSampleRate, globalSampleOffset);
	globalSampleOffset += bytesRead / 2;

	if (symbols.length === 0) return;

	dbgSymbolChunks++;

	// Run frame sync to find all preambles/frame-syncs in this chunk
	const syncResults = frameSyncDetector.processSymbols(symbols);

	// Debug: periodic pipeline report
	const now = Date.now();
	if (now - dbgLastReport >= DBG_REPORT_INTERVAL_MS) {
		dbgLastReport = now;
		console.log(
			`[DECODE DBG] symbols_chunks=${dbgSymbolChunks} syncs=${dbgSyncsFound} ` +
			`fewBits=${dbgTooFewBits} bitCountReject=${dbgBitCountRejected} ` +
			`crcReject=${dbgCrcRejected} passed=${dbgCommandsPassed} | ` +
			`this_chunk: symbols=${symbols.length} syncs=${syncResults.length}`
		);
	}

	if (syncResults.length === 0) return;

	for (const syncResult of syncResults) {
		dbgSyncsFound++;

		// Use pre-extracted dataSymbols from the streaming scanner
		const dataSymbols = syncResult.dataSymbols ?? [];

		// Classify data symbols into bits using the pivot
		const dataBits = frameSyncDetector.classifySymbols(
			dataSymbols,
			syncResult.pivotSamples,
		);

		if (dataBits.length < 2) {
			dbgTooFewBits++;
			continue;
		}

		// Parse command from bits
		const command = decodeCommand(dataBits, syncResult.sampleOffset, currentSampleRate);

		// Track bit-count rejections (decoder returns Unknown for wrong-length commands)
		if (command.type === 'Unknown') {
			dbgBitCountRejected++;
		}

		// Reject commands with failed CRC (null = no CRC field, true = passed)
		if (command.crcValid === false) {
			dbgCrcRejected++;
			continue;
		}

		dbgCommandsPassed++;

		// Track inventory round
		const roundUpdate = inventoryTracker!.processCommand(command);

		// Update stats
		decodeStatsTotal++;
		if (command.crcValid !== null) {
			decodeStatsCrcChecked++;
			if (command.crcValid) decodeStatsCrcPassed++;
		}

		// Add to batch
		decodedCommandBatch.push({
			type: command.type,
			rawBits: command.rawBits,
			sampleOffset: command.sampleOffset,
			timestamp: command.timestamp,
			crcValid: command.crcValid,
			params: command.params,
		});

		if (roundUpdate) {
			roundUpdateBatch.push(roundUpdate);
		}
	}
}

/**
 * Start the polling loop.
 */
function startPolling(): void {
	if (polling) return;
	polling = true;
	totalSamplesProcessed = 0;
	lastStatsReport = 0;
	stagingOffset = 0;
	pollRingBuffer();
}

/**
 * Stop the polling loop.
 */
function stopPolling(): void {
	polling = false;
	if (pollTimer !== null) {
		clearTimeout(pollTimer);
		pollTimer = null;
	}
}

/**
 * Handle messages from the USB Worker (via MessagePort).
 */
function handleDspMessage(msg: UsbToDspMessage): void {
	switch (msg.type) {
		case 'init': {
			ringReader = getRingBufferReader(msg.sharedBuffer);
			break;
		}

		case 'capture-started': {
			currentSampleRate = msg.sampleRate;
			currentCenterFrequency = msg.centerFrequency;
			fftProcessor = new FftProcessor(currentFftSize, 0.3);
			stagingOffset = 0;

			// Initialize demod pipeline
			globalSampleOffset = 0;
			decodedCommandBatch = [];
			roundUpdateBatch = [];
			decodeStatsTotal = 0;
			decodeStatsCrcChecked = 0;
			decodeStatsCrcPassed = 0;
			lastDecodeCommandsSend = 0;
			lastDecodeStatsReport = Date.now();

			frameSyncDetector = new FrameSyncDetector(currentSampleRate);
			inventoryTracker = new InventoryTracker();

			// Init WASM demod (async -- gate demod processing on completion)
			const dp = new DemodProcessor();
			dp.init(16384)
				.then(() => {
					demodProcessor = dp;
					console.log('[DSP Worker] Demod processor ready');
				})
				.catch((err) => {
					console.error('[DSP Worker] Demod init failed:', err);
				});

			startPolling();
			break;
		}

		case 'capture-stopped': {
			stopPolling();
			if (fftProcessor) {
				fftProcessor.dispose();
				fftProcessor = null;
			}
			// Clean up demod pipeline
			if (demodProcessor) {
				demodProcessor.dispose();
				demodProcessor = null;
			}
			if (frameSyncDetector) {
				frameSyncDetector.reset();
			}
			frameSyncDetector = null;
			if (inventoryTracker) {
				inventoryTracker.reset();
				inventoryTracker = null;
			}
			// Flush remaining decoded commands
			if (decodedCommandBatch.length > 0) {
				postToMain({
					type: 'decoded-commands',
					commands: decodedCommandBatch,
					roundUpdates: roundUpdateBatch,
				});
				decodedCommandBatch = [];
				roundUpdateBatch = [];
			}
			break;
		}
	}
}

/**
 * Handle config messages from the main thread (via bridge).
 */
function handleMainMessage(msg: MainToDspMessage): void {
	switch (msg.type) {
		case 'set-fft-size': {
			currentFftSize = msg.size;
			stagingOffset = 0;
			if (fftProcessor) {
				fftProcessor.updateConfig({ fftSize: msg.size });
			}
			break;
		}

		case 'set-averaging': {
			if (fftProcessor) {
				fftProcessor.updateConfig({ alpha: msg.alpha });
			}
			break;
		}

		case 'set-tuning': {
			currentCenterFrequency = msg.centerFrequency;
			currentSampleRate = msg.sampleRate;
			break;
		}
	}
}

// --- Listen for the MessagePort from the bridge ---
self.addEventListener('message', (event: MessageEvent) => {
	const msg = event.data;

	if (msg?.type === 'set-usb-port' && event.ports?.[0]) {
		// Receive the MessagePort for direct USB Worker communication
		const port = event.ports[0];
		port.onmessage = (e: MessageEvent) => handleDspMessage(e.data);
		port.start();
	} else if (msg?.type === 'set-fft-size' || msg?.type === 'set-averaging' || msg?.type === 'set-tuning') {
		// Handle config messages from main thread
		handleMainMessage(msg as MainToDspMessage);
	} else if (msg?.type) {
		// Handle messages sent directly (e.g., from bridge for init)
		handleDspMessage(msg);
	}
});

// Signal readiness to main thread
postToMain({ type: 'dsp-ready' });
