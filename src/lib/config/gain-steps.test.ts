import { describe, it, expect } from 'vitest';
import { R820T2_GAIN_STEPS } from './gain-steps';

describe('R820T2_GAIN_STEPS', () => {
	it('has exactly 29 entries', () => {
		expect(R820T2_GAIN_STEPS).toHaveLength(29);
	});

	it('first value is 0.0', () => {
		expect(R820T2_GAIN_STEPS[0]).toBe(0.0);
	});

	it('last value is 49.6', () => {
		expect(R820T2_GAIN_STEPS[R820T2_GAIN_STEPS.length - 1]).toBe(49.6);
	});

	it('values are sorted ascending', () => {
		for (let i = 1; i < R820T2_GAIN_STEPS.length; i++) {
			expect(R820T2_GAIN_STEPS[i]).toBeGreaterThanOrEqual(R820T2_GAIN_STEPS[i - 1]);
		}
	});

	it('all values are non-negative', () => {
		for (const val of R820T2_GAIN_STEPS) {
			expect(val).toBeGreaterThanOrEqual(0);
		}
	});
});
