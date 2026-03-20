/// <reference lib="webworker" />

import type { UsbToDspMessage, DspToMainMessage, MainToDspMessage } from '$lib/workers/worker-messages';
import { getRingBufferReader } from './ring-buffer';
import { FftProcessor } from './fft-processor';
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
			startPolling();
			break;
		}

		case 'capture-stopped': {
			stopPolling();
			if (fftProcessor) {
				fftProcessor.dispose();
				fftProcessor = null;
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
