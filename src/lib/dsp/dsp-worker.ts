/// <reference lib="webworker" />

import type { UsbToDspMessage, DspToMainMessage } from '$lib/workers/worker-messages';
import { getRingBufferReader } from './ring-buffer';
import { STATS_REPORT_INTERVAL_MS } from '$lib/usb/usb-types';
import type { RingBuffer } from 'ringbuf.js';

declare const self: DedicatedWorkerGlobalScope;

// --- Worker state ---
let ringReader: RingBuffer | null = null;
let polling = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

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
function postToMain(msg: DspToMainMessage): void {
	self.postMessage(msg);
}

/**
 * Poll the ring buffer for available IQ data.
 * In Phase 1, this is a skeleton: data is read and discarded.
 * Phase 2 will add FFT processing; Phase 3 will add demodulation.
 */
function pollRingBuffer(): void {
	if (!polling || !ringReader) return;

	// Read all available data from ring buffer
	let totalRead = 0;
	let read: number;
	do {
		read = ringReader.pop(READ_BUFFER);
		totalRead += read;
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
 * Start the polling loop.
 */
function startPolling(): void {
	if (polling) return;
	polling = true;
	totalSamplesProcessed = 0;
	lastStatsReport = 0;
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
			startPolling();
			break;
		}

		case 'capture-stopped': {
			stopPolling();
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
	} else if (msg?.type) {
		// Handle messages sent directly (e.g., from bridge for init)
		handleDspMessage(msg);
	}
});

// Signal readiness to main thread
postToMain({ type: 'dsp-ready' });
