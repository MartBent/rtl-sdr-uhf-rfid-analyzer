import { describe, it, expect } from 'vitest';
import { generateBlackmanHarris } from './window-functions';

describe('generateBlackmanHarris', () => {
	it('returns Float32Array of the requested length', () => {
		const window = generateBlackmanHarris(1024);
		expect(window).toBeInstanceOf(Float32Array);
		expect(window.length).toBe(1024);
	});

	it('first coefficient is approximately 0.00006 (a0 - a1 + a2 - a3)', () => {
		const window = generateBlackmanHarris(1024);
		// a0 - a1 + a2 - a3 = 0.35875 - 0.48829 + 0.14128 - 0.01168 = 0.00006
		expect(window[0]).toBeCloseTo(0.00006, 4);
	});

	it('last coefficient is approximately 0.00006', () => {
		const window = generateBlackmanHarris(1024);
		expect(window[1023]).toBeCloseTo(0.00006, 4);
	});

	it('center coefficient is approximately 1.0', () => {
		const window = generateBlackmanHarris(1024);
		// Center for N=1024: index 512 (when N-1 is denominator, peak is at N/2)
		// Actually for even N, the peak should be near index (N-1)/2 which is 511.5
		// So indices 511 and 512 should both be close to 1.0
		expect(window[512]).toBeCloseTo(1.0, 2);
	});

	it('all values are between 0 and 1', () => {
		const window = generateBlackmanHarris(1024);
		for (let i = 0; i < window.length; i++) {
			expect(window[i]).toBeGreaterThanOrEqual(0);
			expect(window[i]).toBeLessThanOrEqual(1.0001); // small float tolerance
		}
	});

	it('works with different sizes', () => {
		const window256 = generateBlackmanHarris(256);
		expect(window256.length).toBe(256);
		const window2048 = generateBlackmanHarris(2048);
		expect(window2048.length).toBe(2048);
	});
});
