import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Worker bridge tests.
 *
 * Actual Worker instantiation requires a browser/Worker environment.
 * These tests verify:
 * 1. The module exports the expected function
 * 2. The source code uses the correct Vite worker URL patterns
 * 3. The source code creates a MessageChannel for direct worker communication
 * 4. The source code imports and updates reactive state modules
 */
describe('worker-bridge', () => {
	// Read the source file for pattern verification
	const bridgeSrc = readFileSync(
		resolve(__dirname, 'worker-bridge.ts'),
		'utf-8',
	);

	it('exports createWorkerBridge as a function', async () => {
		// Dynamic import to verify the export exists and is a function
		const mod = await import('./worker-bridge');
		expect(mod.createWorkerBridge).toBeDefined();
		expect(typeof mod.createWorkerBridge).toBe('function');
	});

	it('uses Vite import.meta.url pattern for USB Worker', () => {
		expect(bridgeSrc).toMatch(
			/new Worker\(\s*new URL\(['"]\.\.\/usb\/usb-worker\.ts['"],\s*import\.meta\.url\)/,
		);
	});

	it('uses Vite import.meta.url pattern for DSP Worker', () => {
		expect(bridgeSrc).toMatch(
			/new Worker\(\s*new URL\(['"]\.\.\/dsp\/dsp-worker\.ts['"],\s*import\.meta\.url\)/,
		);
	});

	it('creates a MessageChannel for direct USB-to-DSP communication', () => {
		expect(bridgeSrc).toContain('new MessageChannel()');
	});

	it('sends port to USB Worker with set-dsp-port message', () => {
		expect(bridgeSrc).toContain("type: 'set-dsp-port'");
	});

	it('sends port to DSP Worker with set-usb-port message', () => {
		expect(bridgeSrc).toContain("type: 'set-usb-port'");
	});

	it('imports sdr-state.svelte for reactive state updates', () => {
		expect(bridgeSrc).toContain("from '$lib/state/sdr-state.svelte'");
	});

	it('imports stats-state.svelte for stats updates', () => {
		expect(bridgeSrc).toContain("from '$lib/state/stats-state.svelte'");
	});

	it('handles UsbToMainMessage status type', () => {
		expect(bridgeSrc).toContain("case 'status':");
		expect(bridgeSrc).toContain('sdrState.connectionStatus');
	});

	it('handles UsbToMainMessage device-info type', () => {
		expect(bridgeSrc).toContain("case 'device-info':");
	});

	it('handles UsbToMainMessage stats type', () => {
		expect(bridgeSrc).toContain("case 'stats':");
		expect(bridgeSrc).toContain('updateStats');
	});

	it('handles DspToMainMessage dsp-ready type', () => {
		expect(bridgeSrc).toContain("case 'dsp-ready':");
	});

	it('bridge interface has all required methods in source', () => {
		// Verify the WorkerBridge interface defines all expected methods
		expect(bridgeSrc).toContain('connect(): void');
		expect(bridgeSrc).toContain('disconnect(): void');
		expect(bridgeSrc).toContain('configure(frequency: number, gain: number | null, sampleRate: number): void');
		expect(bridgeSrc).toContain('startCapture(): void');
		expect(bridgeSrc).toContain('stopCapture(): void');
		expect(bridgeSrc).toContain('destroy(): void');
	});

	it('stopCapture resets stats', () => {
		expect(bridgeSrc).toContain('resetStats()');
	});

	it('destroy terminates both workers', () => {
		expect(bridgeSrc).toContain('usbWorker.terminate()');
		expect(bridgeSrc).toContain('dspWorker.terminate()');
	});

	// --- Phase 2: FFT data routing and config methods ---

	it('imports MainToDspMessage type from worker-messages', () => {
		expect(bridgeSrc).toContain('MainToDspMessage');
	});

	it('WorkerBridge interface contains onFftData property', () => {
		expect(bridgeSrc).toContain('onFftData');
	});

	it('WorkerBridge interface contains setFftSize method', () => {
		expect(bridgeSrc).toContain('setFftSize(size: number): void');
	});

	it('WorkerBridge interface contains setAveraging method', () => {
		expect(bridgeSrc).toContain('setAveraging(alpha: number): void');
	});

	it('handles fft-data message from DSP Worker', () => {
		expect(bridgeSrc).toContain("case 'fft-data':");
		expect(bridgeSrc).toContain('fftDataCallback');
	});

	it('has postToDsp helper for sending config to DSP Worker', () => {
		expect(bridgeSrc).toContain('function postToDsp(msg: MainToDspMessage)');
	});
});
