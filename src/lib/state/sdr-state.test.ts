import { describe, it, expect, beforeEach } from 'vitest';
import { sdrState, setRegion, setFrequency, setGain } from './sdr-state.svelte';

describe('sdr-state', () => {
	beforeEach(() => {
		// Reset to defaults before each test
		setRegion('EU');
		sdrState.connectionStatus = 'disconnected';
		sdrState.gain = null;
		sdrState.capturing = false;
	});

	describe('connection status', () => {
		it('defaults to disconnected', () => {
			expect(sdrState.connectionStatus).toBe('disconnected');
		});
	});

	describe('defaults', () => {
		it('sampleRate is 2_400_000', () => {
			expect(sdrState.sampleRate).toBe(2_400_000);
		});

		it('capturing is false', () => {
			expect(sdrState.capturing).toBe(false);
		});
	});

	describe('region', () => {
		it('defaults to EU', () => {
			expect(sdrState.region).toBe('EU');
		});

		it('setRegion(US) updates region to US and frequency to 915_000_000', () => {
			setRegion('US');
			expect(sdrState.region).toBe('US');
			expect(sdrState.frequency).toBe(915_000_000);
		});

		it('setRegion(CN) updates region to CN and frequency to 922_500_000', () => {
			setRegion('CN');
			expect(sdrState.region).toBe('CN');
			expect(sdrState.frequency).toBe(922_500_000);
		});

		it('setRegion(JP) updates region to JP and frequency to 920_000_000', () => {
			setRegion('JP');
			expect(sdrState.region).toBe('JP');
			expect(sdrState.frequency).toBe(920_000_000);
		});

		it('setRegion(EU) resets back to EU and 866_500_000', () => {
			setRegion('US');
			setRegion('EU');
			expect(sdrState.region).toBe('EU');
			expect(sdrState.frequency).toBe(866_500_000);
		});
	});

	describe('manual frequency', () => {
		it('setFrequency updates frequency without changing region', () => {
			setFrequency(920_000_000);
			expect(sdrState.frequency).toBe(920_000_000);
			expect(sdrState.region).toBe('EU');
		});

		it('setFrequency after setRegion overrides the region center frequency', () => {
			setRegion('US');
			setFrequency(910_000_000);
			expect(sdrState.frequency).toBe(910_000_000);
			expect(sdrState.region).toBe('US');
		});
	});

	describe('gain', () => {
		it('defaults to null (AGC)', () => {
			expect(sdrState.gain).toBeNull();
		});

		it('setGain(28.0) updates gain to 28.0', () => {
			setGain(28.0);
			expect(sdrState.gain).toBe(28.0);
		});

		it('setGain(null) resets gain to null', () => {
			setGain(28.0);
			setGain(null);
			expect(sdrState.gain).toBeNull();
		});
	});
});
