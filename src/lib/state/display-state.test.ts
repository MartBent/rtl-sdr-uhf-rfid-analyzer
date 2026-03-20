import { describe, it, expect, beforeEach } from 'vitest';
import {
	displayState,
	setFftSize,
	setAveraging,
	setDbRange,
	setFpsInfo,
} from './display-state.svelte';

describe('display-state', () => {
	beforeEach(() => {
		// Reset to defaults before each test
		displayState.fftSize = 1024;
		displayState.averaging = 0.3;
		displayState.dbMin = -100;
		displayState.dbMax = 0;
		displayState.targetFps = 60;
		displayState.currentFps = 0;
		displayState.throttled = false;
	});

	describe('defaults', () => {
		it('fftSize defaults to 1024', () => {
			expect(displayState.fftSize).toBe(1024);
		});

		it('averaging defaults to 0.3', () => {
			expect(displayState.averaging).toBe(0.3);
		});

		it('dbMin defaults to -100', () => {
			expect(displayState.dbMin).toBe(-100);
		});

		it('dbMax defaults to 0', () => {
			expect(displayState.dbMax).toBe(0);
		});

		it('targetFps defaults to 60', () => {
			expect(displayState.targetFps).toBe(60);
		});
	});

	describe('setFftSize', () => {
		it('setFftSize(2048) updates fftSize to 2048', () => {
			setFftSize(2048);
			expect(displayState.fftSize).toBe(2048);
		});

		it('setFftSize(256) updates fftSize to 256', () => {
			setFftSize(256);
			expect(displayState.fftSize).toBe(256);
		});

		it('rejects non-power-of-2 values (keeps previous)', () => {
			setFftSize(2048);
			setFftSize(1000); // not power of 2
			expect(displayState.fftSize).toBe(2048); // unchanged
		});

		it('rejects values out of range [256, 2048]', () => {
			setFftSize(128); // too small
			expect(displayState.fftSize).toBe(1024); // unchanged from default
			setFftSize(4096); // too large
			expect(displayState.fftSize).toBe(1024); // unchanged
		});
	});

	describe('setAveraging', () => {
		it('setAveraging(0.5) updates averaging to 0.5', () => {
			setAveraging(0.5);
			expect(displayState.averaging).toBe(0.5);
		});

		it('clamps values below 0.01 to 0.01', () => {
			setAveraging(0);
			expect(displayState.averaging).toBe(0.01);
		});

		it('clamps values above 1.0 to 1.0', () => {
			setAveraging(1.5);
			expect(displayState.averaging).toBe(1.0);
		});
	});

	describe('setDbRange', () => {
		it('setDbRange(-80, -10) updates dbMin and dbMax', () => {
			setDbRange(-80, -10);
			expect(displayState.dbMin).toBe(-80);
			expect(displayState.dbMax).toBe(-10);
		});

		it('ensures dbMin < dbMax (rejects if min >= max)', () => {
			setDbRange(-80, -10); // valid first
			setDbRange(-10, -80); // invalid: min > max
			expect(displayState.dbMin).toBe(-80); // unchanged
			expect(displayState.dbMax).toBe(-10); // unchanged
		});

		it('rejects equal min and max', () => {
			setDbRange(-80, -10); // valid first
			setDbRange(-50, -50); // invalid: equal
			expect(displayState.dbMin).toBe(-80); // unchanged
			expect(displayState.dbMax).toBe(-10); // unchanged
		});
	});

	describe('setFpsInfo', () => {
		it('updates currentFps and throttled', () => {
			setFpsInfo(30, true);
			expect(displayState.currentFps).toBe(30);
			expect(displayState.throttled).toBe(true);
		});
	});
});
