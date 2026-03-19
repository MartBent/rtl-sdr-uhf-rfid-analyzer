import { describe, it, expect } from 'vitest';
import { detectFeatures, getMissingFeatureMessage, type FeatureSupport } from './feature-detect';

describe('detectFeatures', () => {
	it('returns object with all 4 boolean fields', () => {
		const features = detectFeatures();
		expect(typeof features.webusb).toBe('boolean');
		expect(typeof features.sharedArrayBuffer).toBe('boolean');
		expect(typeof features.crossOriginIsolated).toBe('boolean');
		expect(typeof features.workers).toBe('boolean');
	});
});

describe('getMissingFeatureMessage', () => {
	it('returns WebUSB message when webusb is false', () => {
		const features: FeatureSupport = {
			webusb: false,
			sharedArrayBuffer: true,
			crossOriginIsolated: true,
			workers: true,
		};
		expect(getMissingFeatureMessage(features)).toBe(
			"This browser doesn't support WebUSB. Use Chrome or Edge.",
		);
	});

	it('returns cross-origin message when crossOriginIsolated is false', () => {
		const features: FeatureSupport = {
			webusb: true,
			sharedArrayBuffer: true,
			crossOriginIsolated: false,
			workers: true,
		};
		expect(getMissingFeatureMessage(features)).toBe(
			'Cross-origin isolation is not enabled. SharedArrayBuffer is unavailable.',
		);
	});

	it('returns null when all features supported', () => {
		const features: FeatureSupport = {
			webusb: true,
			sharedArrayBuffer: true,
			crossOriginIsolated: true,
			workers: true,
		};
		expect(getMissingFeatureMessage(features)).toBeNull();
	});
});
