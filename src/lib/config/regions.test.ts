import { describe, it, expect } from 'vitest';
import { REGION_PRESETS } from './regions';

describe('REGION_PRESETS', () => {
	it('has exactly 4 entries: EU, US, CN, JP', () => {
		const keys = Object.keys(REGION_PRESETS);
		expect(keys).toHaveLength(4);
		expect(keys).toContain('EU');
		expect(keys).toContain('US');
		expect(keys).toContain('CN');
		expect(keys).toContain('JP');
	});

	it('EU centerFrequency is 866_500_000', () => {
		expect(REGION_PRESETS.EU.centerFrequency).toBe(866_500_000);
	});

	it('US centerFrequency is 915_000_000', () => {
		expect(REGION_PRESETS.US.centerFrequency).toBe(915_000_000);
	});

	it('CN centerFrequency is 922_500_000', () => {
		expect(REGION_PRESETS.CN.centerFrequency).toBe(922_500_000);
	});

	it('JP centerFrequency is 920_000_000', () => {
		expect(REGION_PRESETS.JP.centerFrequency).toBe(920_000_000);
	});

	it('each region has bandStart < centerFrequency < bandEnd', () => {
		for (const [id, preset] of Object.entries(REGION_PRESETS)) {
			expect(preset.bandStart).toBeLessThan(preset.centerFrequency);
			expect(preset.centerFrequency).toBeLessThan(preset.bandEnd);
		}
	});

	it('all regions have non-empty name and description', () => {
		for (const preset of Object.values(REGION_PRESETS)) {
			expect(preset.name.length).toBeGreaterThan(0);
			expect(preset.description.length).toBeGreaterThan(0);
		}
	});
});
