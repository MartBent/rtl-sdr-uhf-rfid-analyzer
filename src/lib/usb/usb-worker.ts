/// <reference lib="webworker" />

import type {
	MainToUsbMessage,
	UsbToMainMessage,
	UsbToDspMessage,
} from '$lib/workers/worker-messages';
import { RtlDevice } from './rtl-device.js';
import { createRingBuffer, getRingBufferFillPercent } from '$lib/dsp/ring-buffer';
import {
	RING_BUFFER_SIZE,
	USB_TRANSFER_SIZE,
	STATS_REPORT_INTERVAL_MS,
} from './usb-types.js';
import type { RingBuffer } from 'ringbuf.js';

declare const self: DedicatedWorkerGlobalScope;

// --- Worker state ---
let device: RtlDevice | null = null;
let capturing = false;
let dspPort: MessagePort | null = null;
let ringWriter: RingBuffer | null = null;

// --- Stats tracking ---
let totalSamplesReceived = 0;
let totalDroppedSamples = 0;
let lastStatsReport = 0;

/**
 * Post a typed message to the main thread.
 */
function postToMain(msg: UsbToMainMessage): void {
	self.postMessage(msg);
}

/**
 * Post a typed message to the DSP Worker via MessagePort.
 */
function postToDsp(msg: UsbToDspMessage): void {
	if (dspPort) {
		dspPort.postMessage(msg);
	}
}

/**
 * Report capture stats to the main thread at a throttled rate.
 */
function maybeReportStats(now: number): void {
	if (now - lastStatsReport >= STATS_REPORT_INTERVAL_MS) {
		lastStatsReport = now;
		const bufferFill = ringWriter ? getRingBufferFillPercent(ringWriter) : 0;
		postToMain({
			type: 'stats',
			samplesReceived: totalSamplesReceived,
			droppedSamples: totalDroppedSamples,
			bufferFill,
		});
	}
}

/**
 * Async capture loop: reads IQ samples from the RTL-SDR device
 * and pushes them into the SharedArrayBuffer ring buffer.
 */
async function captureLoop(): Promise<void> {
	if (!device || !ringWriter) return;

	try {
		await device.resetBuffer();
	} catch {
		// Non-fatal: resetBuffer may fail on some devices
	}

	while (capturing && device?.isOpen) {
		try {
			const samples = await device.readSamples(USB_TRANSFER_SIZE);

			if (!capturing) break;

			const written = ringWriter.push(samples);
			const sampleCount = samples.length / 2; // IQ pairs
			totalSamplesReceived += sampleCount;

			if (written < samples.length) {
				const droppedBytes = samples.length - written;
				totalDroppedSamples += droppedBytes / 2;
			}

			maybeReportStats(Date.now());
		} catch (err) {
			// USB read failed -- likely device disconnect
			capturing = false;
			device = null;
			postToMain({
				type: 'status',
				status: 'error',
				error: `Capture error: ${err instanceof Error ? err.message : String(err)}`,
			});
			postToDsp({ type: 'capture-stopped' });
			return;
		}
	}
}

/**
 * Handle messages from the main thread (WorkerBridge).
 */
async function handleMessage(msg: MainToUsbMessage | { type: 'set-dsp-port'; port: MessagePort }): Promise<void> {
	switch (msg.type) {
		case 'set-dsp-port': {
			dspPort = msg.port;
			break;
		}

		case 'connect': {
			postToMain({ type: 'status', status: 'connecting' });
			try {
				device = await RtlDevice.findAndConnect();
				postToMain({ type: 'status', status: 'connected' });
				postToMain({ type: 'device-info', name: 'RTL2832U' });
			} catch (err) {
				device = null;
				postToMain({
					type: 'status',
					status: 'error',
					error: err instanceof Error ? err.message : String(err),
				});
			}
			break;
		}

		case 'disconnect': {
			capturing = false;
			if (device) {
				await device.close();
				device = null;
			}
			postToMain({ type: 'status', status: 'disconnected' });
			break;
		}

		case 'configure': {
			if (!device?.isOpen) {
				postToMain({
					type: 'status',
					status: 'error',
					error: 'Cannot configure: device not connected',
				});
				return;
			}
			try {
				await device.configure(msg.frequency, msg.gain, msg.sampleRate);
			} catch (err) {
				postToMain({
					type: 'status',
					status: 'error',
					error: `Configuration failed: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
			break;
		}

		case 'start-capture': {
			if (!device?.isOpen) {
				postToMain({
					type: 'status',
					status: 'error',
					error: 'Cannot capture: device not connected',
				});
				return;
			}

			// Create ring buffer and share with DSP Worker
			const { sab, writer } = createRingBuffer(RING_BUFFER_SIZE);
			ringWriter = writer;

			// Reset stats
			totalSamplesReceived = 0;
			totalDroppedSamples = 0;
			lastStatsReport = 0;

			// Send SharedArrayBuffer to DSP Worker
			postToDsp({ type: 'init', sharedBuffer: sab });
			postToDsp({
				type: 'capture-started',
				sampleRate: 2_400_000,
				centerFrequency: 866_500_000,
			});

			capturing = true;
			// Start capture loop (non-blocking -- runs as async microtasks)
			captureLoop();
			break;
		}

		case 'stop-capture': {
			capturing = false;
			postToDsp({ type: 'capture-stopped' });
			break;
		}
	}
}

// --- Message listener ---
self.addEventListener('message', (event: MessageEvent) => {
	handleMessage(event.data);
});

// --- Surprise USB disconnect detection ---
if ('usb' in navigator) {
	navigator.usb.addEventListener('disconnect', (event: USBConnectionEvent) => {
		// Check if the disconnected device is our RTL-SDR
		if (device?.isOpen) {
			capturing = false;
			device = null;
			ringWriter = null;
			postToMain({ type: 'status', status: 'disconnected' });
			postToDsp({ type: 'capture-stopped' });
		}
	});
}
