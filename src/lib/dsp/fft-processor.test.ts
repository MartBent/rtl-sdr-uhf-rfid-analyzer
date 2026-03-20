import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock webfft before importing FftProcessor
vi.mock('webfft', () => {
	return {
		default: class MockWebFFT {
			size: number;
			constructor(size: number) {
				this.size = size;
			}
			fft(input: Float32Array): Float32Array {
				// Simple passthrough mock: return the input as-is (interleaved complex)
				const output = new Float32Array(input.length);
				output.set(input);
				return output;
			}
			dispose(): void {
				// no-op
			}
		},
	};
});

import { FftProcessor } from './fft-processor';

describe('FftProcessor', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('constructs with default parameters', () => {
		const processor = new FftProcessor(1024, 0.3);
		expect(processor).toBeDefined();
		processor.dispose();
	});

	it('process() returns a Float32Array of length fftSize', () => {
		const processor = new FftProcessor(1024, 0.3);
		// Create dummy IQ data: 1024 samples * 2 bytes (I,Q) = 2048 bytes
		const rawIq = new Uint8Array(2048);
		// Fill with mid-range values (DC at 127.5)
		for (let i = 0; i < rawIq.length; i++) {
			rawIq[i] = 128;
		}
		const result = processor.process(rawIq, 0, 1024);
		expect(result).toBeInstanceOf(Float32Array);
		expect(result.length).toBe(1024);
		processor.dispose();
	});

	it('process() output values are in dBFS range (negative numbers)', () => {
		const processor = new FftProcessor(1024, 0.3);
		const rawIq = new Uint8Array(2048);
		// Fill with a simple pattern
		for (let i = 0; i < rawIq.length; i++) {
			rawIq[i] = 128 + Math.round(50 * Math.sin((i / 2) * 0.1));
		}
		const result = processor.process(rawIq, 0, 1024);
		for (let i = 0; i < result.length; i++) {
			expect(result[i]).toBeLessThanOrEqual(0);
			expect(result[i]).toBeGreaterThanOrEqual(-200);
		}
		processor.dispose();
	});

	it('EMA averaging converges when called multiple times with same input', () => {
		const processor = new FftProcessor(256, 0.3);
		const rawIq = new Uint8Array(512);
		for (let i = 0; i < rawIq.length; i++) {
			rawIq[i] = 128 + Math.round(30 * Math.sin((i / 2) * 0.2));
		}

		let prev: Float32Array | null = null;
		let maxDiff = Infinity;

		// Run 20 iterations to allow convergence
		for (let iter = 0; iter < 20; iter++) {
			const result = processor.process(rawIq, 0, 256);
			if (prev) {
				let diff = 0;
				for (let i = 0; i < result.length; i++) {
					diff += Math.abs(result[i] - prev[i]);
				}
				maxDiff = diff;
			}
			prev = new Float32Array(result);
		}

		// After many iterations with same input, differences should be very small
		expect(maxDiff).toBeLessThan(1.0);
		processor.dispose();
	});

	it('updateConfig changes fft size', () => {
		const processor = new FftProcessor(1024, 0.3);
		processor.updateConfig({ fftSize: 2048 });

		const rawIq = new Uint8Array(4096); // 2048 samples * 2 bytes
		for (let i = 0; i < rawIq.length; i++) {
			rawIq[i] = 128;
		}
		const result = processor.process(rawIq, 0, 2048);
		expect(result.length).toBe(2048);
		processor.dispose();
	});

	it('updateConfig changes alpha without changing fft size', () => {
		const processor = new FftProcessor(1024, 0.3);
		// Should not throw
		processor.updateConfig({ alpha: 0.5 });

		const rawIq = new Uint8Array(2048);
		for (let i = 0; i < rawIq.length; i++) {
			rawIq[i] = 128;
		}
		const result = processor.process(rawIq, 0, 1024);
		expect(result.length).toBe(1024);
		processor.dispose();
	});

	it('dispose() can be called without error', () => {
		const processor = new FftProcessor(1024, 0.3);
		expect(() => processor.dispose()).not.toThrow();
	});
});
