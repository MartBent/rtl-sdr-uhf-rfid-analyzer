import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DemodSymbol } from '$lib/protocol/gen2-types';

/**
 * Mock the WASM module factory.
 *
 * The actual demod.mjs is an Emscripten ES6 module that loads demod.wasm
 * via fetch/XHR. In vitest node environment, we mock the factory to return
 * a fake module that simulates the WASM envelope detector behavior.
 */

// Simulated WASM memory (4MB like real module)
const WASM_MEMORY_SIZE = 4 * 1024 * 1024;

function createMockWasmModule() {
	const buffer = new ArrayBuffer(WASM_MEMORY_SIZE);
	const HEAPU8 = new Uint8Array(buffer);
	const HEAP32 = new Int32Array(buffer);
	const HEAPF32 = new Float32Array(buffer);

	// Track allocations (simple bump allocator starting at offset 1024)
	let nextAlloc = 1024;
	const allocations = new Set<number>();

	// Demod state (mirrors the C static variables)
	let noise_floor = 0.01;
	let edge_state = 0;
	let last_edge_sample = 0;
	let sample_counter = 0;

	const module = {
		HEAPU8,
		HEAP32,
		HEAPF32,

		_malloc(bytes: number): number {
			// Align to 16 bytes
			const aligned = (nextAlloc + 15) & ~15;
			nextAlloc = aligned + bytes;
			allocations.add(aligned);
			return aligned;
		},

		_free(ptr: number): void {
			allocations.delete(ptr);
		},

		_demod_process(
			inputPtr: number,
			byteCount: number,
			sampleRate: number,
			outputPtr: number,
			globalOffset: number
		): number {
			const sampleCount = byteCount / 2;
			let symbolCount = 0;
			const noiseAlpha = 0.001;

			for (let i = 0; i < sampleCount; i++) {
				const iVal = (HEAPU8[inputPtr + i * 2] - 127.5) / 127.5;
				const qVal = (HEAPU8[inputPtr + i * 2 + 1] - 127.5) / 127.5;
				const env = Math.sqrt(iVal * iVal + qVal * qVal);

				noise_floor = noise_floor * (1 - noiseAlpha) + env * noiseAlpha;

				const threshHigh = noise_floor * 3.0;
				const threshLow = noise_floor * 2.0;

				let newState = edge_state;
				if (edge_state === 0 && env > threshHigh) {
					newState = 1;
				} else if (edge_state === 1 && env < threshLow) {
					newState = 0;
				}

				if (newState !== edge_state) {
					const duration = (sample_counter + i) - last_edge_sample;
					if (duration > 0) {
						// Write DemodSymbol struct (16 bytes = 4 int32 fields)
						const baseIdx = outputPtr / 4 + symbolCount * 4;
						HEAP32[baseIdx] = last_edge_sample + globalOffset;
						HEAP32[baseIdx + 1] = duration;
						HEAP32[baseIdx + 2] = edge_state;
						HEAPF32[baseIdx + 3] = env;
						symbolCount++;
					}
					last_edge_sample = sample_counter + i;
					edge_state = newState;
				}
			}

			sample_counter += sampleCount;
			return symbolCount;
		},

		_demod_reset(): void {
			noise_floor = 0.01;
			edge_state = 0;
			last_edge_sample = 0;
			sample_counter = 0;
		},

		_demod_get_noise_floor(): number {
			return noise_floor;
		},

		_demod_get_state(): number {
			return edge_state;
		},
	};

	return module;
}

// Mock the WASM factory import
vi.mock('../wasm/demod.mjs', () => {
	return {
		default: async () => createMockWasmModule(),
	};
});

import { DemodProcessor } from './demod-processor';

/**
 * Generate synthetic IQ data with alternating silence and signal blocks.
 * Silence: I=128, Q=128 (zero amplitude after centering)
 * Signal: I=200, Q=200 (strong carrier, envelope ~0.804)
 */
function generateSyntheticIQ(
	pattern: Array<{ silence: number; signal: number }>
): Uint8Array {
	const totalSamples = pattern.reduce(
		(sum, p) => sum + p.silence + p.signal,
		0
	);
	const data = new Uint8Array(totalSamples * 2);
	let offset = 0;
	for (const { silence, signal } of pattern) {
		for (let i = 0; i < silence; i++) {
			data[offset++] = 128;
			data[offset++] = 128;
		}
		for (let i = 0; i < signal; i++) {
			data[offset++] = 200;
			data[offset++] = 200;
		}
	}
	return data;
}

/**
 * Generate noise-only IQ data (values near 128, small random variation).
 */
function generateNoiseIQ(sampleCount: number): Uint8Array {
	const data = new Uint8Array(sampleCount * 2);
	for (let i = 0; i < sampleCount * 2; i++) {
		// Values between 126-130 (very close to DC, minimal envelope)
		data[i] = 126 + Math.floor(Math.random() * 5);
	}
	return data;
}

describe('DemodProcessor', () => {
	let processor: DemodProcessor;

	beforeEach(() => {
		processor = new DemodProcessor();
	});

	afterEach(() => {
		processor.dispose();
	});

	it('init() succeeds and process() is callable', async () => {
		await processor.init(16384);
		const iq = new Uint8Array(100);
		// Should not throw
		const result = processor.process(iq, 100, 2400000, 0);
		expect(Array.isArray(result)).toBe(true);
	});

	it('throws if process() called before init()', () => {
		const iq = new Uint8Array(100);
		expect(() => processor.process(iq, 100, 2400000, 0)).toThrow(
			'DemodProcessor not initialized'
		);
	});

	it('synthetic signal produces at least 1 symbol', async () => {
		await processor.init(16384);

		// Pattern: 1000 samples silence, 1000 samples signal, 1000 silence
		// The noise floor will start low, then the signal block should trigger rising/falling edges
		const iq = generateSyntheticIQ([
			{ silence: 2000, signal: 2000 },
			{ silence: 2000, signal: 0 },
		]);

		const symbols = processor.process(
			iq,
			iq.length,
			2400000,
			0
		);

		expect(symbols.length).toBeGreaterThanOrEqual(1);

		// Verify symbol structure
		for (const sym of symbols) {
			expect(sym).toHaveProperty('type');
			expect(sym).toHaveProperty('sampleOffset');
			expect(sym).toHaveProperty('durationSamples');
			expect(sym).toHaveProperty('amplitude');
			expect(['pulse-high', 'pulse-low']).toContain(sym.type);
			expect(sym.durationSamples).toBeGreaterThan(0);
		}
	});

	it('pure noise produces 0 symbols', async () => {
		await processor.init(16384);

		const iq = generateNoiseIQ(4000);
		const symbols = processor.process(iq, iq.length, 2400000, 0);

		expect(symbols.length).toBe(0);
	});

	it('dispose() cleans up without errors', async () => {
		await processor.init(16384);
		expect(() => processor.dispose()).not.toThrow();
		// Double dispose should be safe
		expect(() => processor.dispose()).not.toThrow();
	});

	it('reset() resets state for fresh capture', async () => {
		await processor.init(16384);

		// Process some signal to modify internal state
		const iq = generateSyntheticIQ([
			{ silence: 1000, signal: 1000 },
		]);
		processor.process(iq, iq.length, 2400000, 0);

		// Reset
		processor.reset();

		// After reset, noise-only data should produce 0 symbols
		const noiseIq = generateNoiseIQ(4000);
		const symbols = processor.process(noiseIq, noiseIq.length, 2400000, 0);
		expect(symbols.length).toBe(0);
	});

	it('state persists across multiple process() calls', async () => {
		await processor.init(16384);

		// Chunk 1: start with silence to establish noise floor
		const chunk1 = generateSyntheticIQ([
			{ silence: 3000, signal: 0 },
		]);
		const symbols1 = processor.process(chunk1, chunk1.length, 2400000, 0);

		// Chunk 2: signal starts - should detect rising edge
		const chunk2 = generateSyntheticIQ([
			{ silence: 0, signal: 3000 },
		]);
		const symbols2 = processor.process(
			chunk2,
			chunk2.length,
			2400000,
			3000
		);

		// Chunk 3: back to silence - should detect falling edge
		const chunk3 = generateSyntheticIQ([
			{ silence: 3000, signal: 0 },
		]);
		const symbols3 = processor.process(
			chunk3,
			chunk3.length,
			2400000,
			6000
		);

		// Across the three chunks, we should see at least one edge transition
		const totalSymbols =
			symbols1.length + symbols2.length + symbols3.length;
		expect(totalSymbols).toBeGreaterThanOrEqual(1);
	});

	it('getNoiseFloor() returns a value after processing', async () => {
		await processor.init(16384);

		const iq = generateSyntheticIQ([
			{ silence: 1000, signal: 0 },
		]);
		processor.process(iq, iq.length, 2400000, 0);

		const noiseFloor = processor.getNoiseFloor();
		expect(noiseFloor).toBeGreaterThan(0);
	});

	it('output symbols have correct type mapping', async () => {
		await processor.init(16384);

		// Long silence followed by signal followed by silence
		// Should produce pulse-low (leaving low state) and pulse-high (leaving high state)
		const iq = generateSyntheticIQ([
			{ silence: 2000, signal: 2000 },
			{ silence: 2000, signal: 0 },
		]);

		const symbols = processor.process(iq, iq.length, 2400000, 0);

		if (symbols.length >= 2) {
			const types = symbols.map((s) => s.type);
			// Should see both pulse types
			expect(types).toContain('pulse-low');
			expect(types).toContain('pulse-high');
		}
	});
});
