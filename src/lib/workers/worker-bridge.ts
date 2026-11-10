import type {
	MainToUsbMessage,
	UsbToMainMessage,
	DspToMainMessage,
	MainToDspMessage,
	ConnectionStatus,
} from './worker-messages';
import { sdrState } from '$lib/state/sdr-state.svelte';
import { updateStats, resetStats } from '$lib/state/stats-state.svelte';
import {
	pushDecodedCommands,
	pushRoundUpdates,
	updateDecodeStats,
	resetDecodeState,
	setDecodeActive,
} from '$lib/state/decode-state.svelte';
import type { Gen2Command } from '$lib/protocol/gen2-types';

/**
 * Public interface for controlling the USB/DSP worker pipeline.
 *
 * The UI interacts exclusively through this interface.
 * Workers are fully encapsulated -- the main thread never touches USB or DSP directly.
 */
export interface WorkerBridge {
	/** Send connect message to USB Worker (find and open RTL-SDR device). */
	connect(): void;
	/** Send disconnect message to USB Worker (close device). */
	disconnect(): void;
	/** Send configuration to USB Worker (frequency, gain, sample rate). */
	configure(frequency: number, gain: number | null, sampleRate: number): void;
	/** Start IQ capture: USB Worker begins reading and pushing to ring buffer. */
	startCapture(): void;
	/** Stop IQ capture. */
	stopCapture(): void;
	/** Terminate both workers and clean up. */
	destroy(): void;
	/** Set callback for FFT data from DSP Worker. */
	onFftData: ((bins: Float32Array, binCount: number, centerFrequency: number, sampleRate: number) => void) | null;
	/** Set callback for decoded command data from DSP Worker. */
	onDecodedData: ((commands: Gen2Command[]) => void) | null;
	/** Send FFT size change to DSP Worker. */
	setFftSize(size: number): void;
	/** Send averaging alpha change to DSP Worker. */
	setAveraging(alpha: number): void;
}

/**
 * Create and wire up the USB Worker and DSP Worker.
 *
 * - USB Worker: WebUSB device I/O, IQ sample capture, ring buffer writer
 * - DSP Worker: Ring buffer reader, signal processing skeleton
 * - MessageChannel: Direct USB-to-DSP communication path (bypasses main thread)
 * - Message routing: Worker status/stats messages update reactive Svelte state
 *
 * @returns A WorkerBridge with typed control methods.
 */
export function createWorkerBridge(): WorkerBridge {
	// Create workers using Vite's import.meta.url worker pattern
	const usbWorker = new Worker(
		new URL('../usb/usb-worker.ts', import.meta.url),
		{ type: 'module' },
	);

	const dspWorker = new Worker(
		new URL('../dsp/dsp-worker.ts', import.meta.url),
		{ type: 'module' },
	);

	// Create a MessageChannel for direct USB Worker <-> DSP Worker communication.
	// This bypasses the main thread for the high-bandwidth IQ data path.
	const channel = new MessageChannel();

	// Send port1 to USB Worker for sending ring buffer init and capture state to DSP
	usbWorker.postMessage({ type: 'set-dsp-port', port: channel.port1 }, [channel.port1]);

	// Send port2 to DSP Worker for receiving messages from USB Worker
	dspWorker.postMessage({ type: 'set-usb-port' }, [channel.port2]);

	// --- Route USB Worker messages to reactive state ---
	usbWorker.onmessage = (event: MessageEvent<UsbToMainMessage>) => {
		const msg = event.data;

		switch (msg.type) {
			case 'status': {
				sdrState.connectionStatus = msg.status as ConnectionStatus;
				sdrState.errorMessage = msg.error ?? '';

				// If device disconnected or errored during capture, reset capture state
				if (msg.status === 'disconnected' || msg.status === 'error') {
					sdrState.capturing = false;
				}
				break;
			}

			case 'device-info': {
				console.log(`[USB Worker] Device: ${msg.name}${msg.serial ? ` (${msg.serial})` : ''}`);
				break;
			}

			case 'stats': {
				updateStats(msg.samplesReceived, msg.droppedSamples, msg.bufferFill);
				break;
			}
		}
	};

	usbWorker.onerror = (event: ErrorEvent) => {
		console.error('[USB Worker] Error:', event.message);
		sdrState.connectionStatus = 'error';
		// ErrorEvent.message is empty for a cross-origin or early worker failure,
		// and "undefined" on screen tells the user nothing they can act on.
		sdrState.errorMessage = event.message
			? `USB worker: ${event.message}`
			: 'The USB worker stopped. Reload the page and pair the dongle again.';
	};

	// --- FFT data callback ---
	let fftDataCallback: WorkerBridge['onFftData'] = null;

	// --- Decoded data callback ---
	let decodedDataCallback: WorkerBridge['onDecodedData'] = null;

	// --- Helper to send config messages to DSP Worker ---
	function postToDsp(msg: MainToDspMessage): void {
		dspWorker.postMessage(msg);
	}

	// --- Route DSP Worker messages ---
	dspWorker.onmessage = (event: MessageEvent<DspToMainMessage>) => {
		const msg = event.data;

		switch (msg.type) {
			case 'dsp-ready': {
				console.log('[DSP Worker] Ready');
				break;
			}

			case 'dsp-stats': {
				console.log(`[DSP Worker] Processed: ${msg.samplesProcessed} samples`);
				break;
			}

			case 'fft-data': {
				if (fftDataCallback) {
					fftDataCallback(msg.bins, msg.binCount, msg.centerFrequency, msg.sampleRate);
				}
				break;
			}

			case 'decoded-commands': {
				const commands: Gen2Command[] = msg.commands.map((cmd) => ({
					...cmd,
					roundId: 0,
				}));
				pushDecodedCommands(commands);
				if (msg.roundUpdates.length > 0) {
					pushRoundUpdates(msg.roundUpdates);
				}
				if (decodedDataCallback) {
					decodedDataCallback(commands);
				}
				break;
			}

			case 'decode-stats': {
				updateDecodeStats({
					totalCommands: msg.totalCommands,
					crcPassRate: msg.crcPassRate,
					commandsPerSec: msg.commandsPerSec,
					detectedTari: msg.detectedTari,
				});
				break;
			}
		}
	};

	dspWorker.onerror = (event: ErrorEvent) => {
		console.error('[DSP Worker] Error:', event.message);
	};

	// --- Build the WorkerBridge interface ---
	function postToUsb(msg: MainToUsbMessage): void {
		usbWorker.postMessage(msg);
	}

	return {
		connect(): void {
			postToUsb({ type: 'connect' });
		},

		disconnect(): void {
			postToUsb({ type: 'disconnect' });
		},

		configure(frequency: number, gain: number | null, sampleRate: number): void {
			postToUsb({ type: 'configure', frequency, gain, sampleRate });
			postToDsp({ type: 'set-tuning', centerFrequency: frequency, sampleRate });
		},

		startCapture(): void {
			postToUsb({ type: 'start-capture' });
			sdrState.capturing = true;
			setDecodeActive(true);
		},

		stopCapture(): void {
			postToUsb({ type: 'stop-capture' });
			sdrState.capturing = false;
			resetStats();
			resetDecodeState();
			setDecodeActive(false);
		},

		destroy(): void {
			usbWorker.terminate();
			dspWorker.terminate();
		},

		get onFftData() {
			return fftDataCallback;
		},

		set onFftData(cb: WorkerBridge['onFftData']) {
			fftDataCallback = cb;
		},

		get onDecodedData() {
			return decodedDataCallback;
		},

		set onDecodedData(cb: WorkerBridge['onDecodedData']) {
			decodedDataCallback = cb;
		},

		setFftSize(size: number): void {
			postToDsp({ type: 'set-fft-size', size });
		},

		setAveraging(alpha: number): void {
			postToDsp({ type: 'set-averaging', alpha });
		},
	};
}
