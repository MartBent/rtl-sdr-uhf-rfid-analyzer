import { describe, it, expect } from 'vitest';
import { FrameSyncDetector } from './frame-sync';
import type { DemodSymbol } from './gen2-types';

/**
 * Helper: create a DemodSymbol with given parameters.
 */
function makeSymbol(
	type: 'pulse-high' | 'pulse-low',
	sampleOffset: number,
	durationSamples: number,
	amplitude: number = 1.0
): DemodSymbol {
	return { type, sampleOffset, durationSamples, amplitude };
}

describe('FrameSyncDetector', () => {
	// At 2.4 MSPS:
	// Delimiter = 12.5us = 30 samples
	// Tari = 12.5us (data-0) = 30 samples
	// data-1 = 1.5x Tari = 45 samples (for Tari = 12.5us)
	// RTcal = data-0 + data-1 = 30 + 45 = 75 samples
	// Pivot = RTcal / 2 = 37.5 samples
	const SAMPLE_RATE = 2_400_000;
	const TARI_12_5US = 30; // 12.5us * 2.4MSPS
	const DATA1_12_5US = 45; // 1.5x Tari
	const RTCAL_12_5US = TARI_12_5US + DATA1_12_5US; // 75 samples
	const DELIMITER = 30; // 12.5us * 2.4MSPS
	const TRCAL = 120; // arbitrary TRcal for preamble

	describe('preamble detection (Tari = 12.5us)', () => {
		it('detects a preamble pattern with correct Tari and pivot', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);

			// Preamble: Delimiter(low) + data-0(high) + RTcal(low+high combined) + TRcal(low)
			// Simplified: symbols represent measured pulse durations
			const symbols: DemodSymbol[] = [
				makeSymbol('pulse-low', 0, DELIMITER), // Delimiter
				makeSymbol('pulse-high', DELIMITER, TARI_12_5US), // data-0 (Tari)
				makeSymbol('pulse-low', DELIMITER + TARI_12_5US, RTCAL_12_5US), // RTcal
				makeSymbol('pulse-high', DELIMITER + TARI_12_5US + RTCAL_12_5US, TRCAL), // TRcal
			];

			const result = detector.processSymbols(symbols);
			expect(result).not.toBeNull();
			expect(result!.type).toBe('preamble');
			expect(result!.tariSamples).toBe(TARI_12_5US);
			expect(result!.pivotSamples).toBe(RTCAL_12_5US / 2);
			expect(result!.blf).toBeDefined();
			expect(result!.dataStartIndex).toBe(4); // data starts after TRcal
		});

		it('extracts BLF from TRcal with DR=8', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);

			const symbols: DemodSymbol[] = [
				makeSymbol('pulse-low', 0, DELIMITER),
				makeSymbol('pulse-high', DELIMITER, TARI_12_5US),
				makeSymbol('pulse-low', DELIMITER + TARI_12_5US, RTCAL_12_5US),
				makeSymbol('pulse-high', DELIMITER + TARI_12_5US + RTCAL_12_5US, TRCAL),
			];

			const result = detector.processSymbols(symbols);
			expect(result).not.toBeNull();
			// BLF = DR / TRcal_seconds. Default DR=8.
			// TRcal_seconds = TRCAL / SAMPLE_RATE = 120 / 2400000 = 50us
			// BLF = 8 / 50e-6 = 160000 Hz
			const expectedBlf = 8 / (TRCAL / SAMPLE_RATE);
			expect(result!.blf).toBeCloseTo(expectedBlf, 0);
		});
	});

	describe('preamble detection (Tari = 25us)', () => {
		const TARI_25US = 60; // 25us * 2.4MSPS
		const DATA1_25US = 90; // 1.5x Tari
		const RTCAL_25US = TARI_25US + DATA1_25US; // 150 samples
		const DELIMITER_25 = 30; // Delimiter is always 12.5us

		it('detects preamble with larger Tari and correct timing', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);

			const symbols: DemodSymbol[] = [
				makeSymbol('pulse-low', 0, DELIMITER_25),
				makeSymbol('pulse-high', DELIMITER_25, TARI_25US),
				makeSymbol('pulse-low', DELIMITER_25 + TARI_25US, RTCAL_25US),
				makeSymbol('pulse-high', DELIMITER_25 + TARI_25US + RTCAL_25US, TRCAL),
			];

			const result = detector.processSymbols(symbols);
			expect(result).not.toBeNull();
			expect(result!.type).toBe('preamble');
			expect(result!.tariSamples).toBe(TARI_25US);
			expect(result!.pivotSamples).toBe(RTCAL_25US / 2);
		});
	});

	describe('frame-sync detection', () => {
		it('detects frame-sync pattern (no TRcal)', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);

			// Frame-sync: Delimiter + data-0 + RTcal (no TRcal)
			// After RTcal, data symbols follow (not a TRcal-length symbol)
			const symbols: DemodSymbol[] = [
				makeSymbol('pulse-low', 0, DELIMITER),
				makeSymbol('pulse-high', DELIMITER, TARI_12_5US),
				makeSymbol('pulse-low', DELIMITER + TARI_12_5US, RTCAL_12_5US),
				// Next symbol is a data symbol (short, not TRcal)
				makeSymbol('pulse-high', DELIMITER + TARI_12_5US + RTCAL_12_5US, 20), // shorter than RTcal => data
			];

			const result = detector.processSymbols(symbols);
			expect(result).not.toBeNull();
			expect(result!.type).toBe('frame-sync');
			expect(result!.tariSamples).toBe(TARI_12_5US);
			expect(result!.pivotSamples).toBe(RTCAL_12_5US / 2);
			expect(result!.blf).toBeUndefined();
			expect(result!.dataStartIndex).toBe(3); // data starts at index 3 (after RTcal)
		});
	});

	describe('delimiter detection', () => {
		it('accepts delimiter within 20% tolerance', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const nominalDelimiter = 30; // 12.5us at 2.4MSPS

			// +20% = 36 samples
			const symbolsHigh: DemodSymbol[] = [
				makeSymbol('pulse-low', 0, 36),
				makeSymbol('pulse-high', 36, TARI_12_5US),
				makeSymbol('pulse-low', 36 + TARI_12_5US, RTCAL_12_5US),
				makeSymbol('pulse-high', 36 + TARI_12_5US + RTCAL_12_5US, 20),
			];
			const resultHigh = detector.processSymbols(symbolsHigh);
			expect(resultHigh).not.toBeNull();

			// -20% = 24 samples
			const detector2 = new FrameSyncDetector(SAMPLE_RATE);
			const symbolsLow: DemodSymbol[] = [
				makeSymbol('pulse-low', 0, 24),
				makeSymbol('pulse-high', 24, TARI_12_5US),
				makeSymbol('pulse-low', 24 + TARI_12_5US, RTCAL_12_5US),
				makeSymbol('pulse-high', 24 + TARI_12_5US + RTCAL_12_5US, 20),
			];
			const resultLow = detector2.processSymbols(symbolsLow);
			expect(resultLow).not.toBeNull();
		});

		it('rejects delimiter outside tolerance', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);

			// Way too long: 50 samples (66% of nominal)
			const symbols: DemodSymbol[] = [
				makeSymbol('pulse-low', 0, 50),
				makeSymbol('pulse-high', 50, TARI_12_5US),
				makeSymbol('pulse-low', 50 + TARI_12_5US, RTCAL_12_5US),
				makeSymbol('pulse-high', 50 + TARI_12_5US + RTCAL_12_5US, 20),
			];

			const result = detector.processSymbols(symbols);
			expect(result).toBeNull();
		});
	});

	describe('symbol classification', () => {
		it('classifies data symbols using pivot threshold', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const pivot = RTCAL_12_5US / 2; // 37.5 samples

			// Symbols with various durations
			const symbols: DemodSymbol[] = [
				makeSymbol('pulse-high', 0, 25), // < pivot => 0
				makeSymbol('pulse-high', 25, 50), // >= pivot => 1
				makeSymbol('pulse-high', 75, 30), // < pivot => 0
				makeSymbol('pulse-high', 105, 37), // < pivot => 0
				makeSymbol('pulse-high', 142, 38), // >= pivot => 1
				makeSymbol('pulse-high', 180, 60), // >= pivot => 1
			];

			const bits = detector.classifySymbols(symbols, pivot);
			expect(bits).toEqual([0, 1, 0, 0, 1, 1]);
		});

		it('classifies all-zero symbols', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const pivot = 37.5;

			const symbols: DemodSymbol[] = [
				makeSymbol('pulse-high', 0, 20),
				makeSymbol('pulse-high', 20, 25),
				makeSymbol('pulse-high', 45, 15),
			];

			const bits = detector.classifySymbols(symbols, pivot);
			expect(bits).toEqual([0, 0, 0]);
		});

		it('classifies all-one symbols', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const pivot = 37.5;

			const symbols: DemodSymbol[] = [
				makeSymbol('pulse-high', 0, 45),
				makeSymbol('pulse-high', 45, 50),
				makeSymbol('pulse-high', 95, 60),
			];

			const bits = detector.classifySymbols(symbols, pivot);
			expect(bits).toEqual([1, 1, 1]);
		});
	});

	describe('edge cases', () => {
		it('returns null for empty symbol array', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const result = detector.processSymbols([]);
			expect(result).toBeNull();
		});

		it('returns null for insufficient symbols (less than 3)', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const symbols: DemodSymbol[] = [
				makeSymbol('pulse-low', 0, DELIMITER),
				makeSymbol('pulse-high', DELIMITER, TARI_12_5US),
			];
			const result = detector.processSymbols(symbols);
			expect(result).toBeNull();
		});

		it('returns null when first symbol is not pulse-low (no delimiter)', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const symbols: DemodSymbol[] = [
				makeSymbol('pulse-high', 0, DELIMITER), // wrong type
				makeSymbol('pulse-high', DELIMITER, TARI_12_5US),
				makeSymbol('pulse-low', DELIMITER + TARI_12_5US, RTCAL_12_5US),
			];
			const result = detector.processSymbols(symbols);
			expect(result).toBeNull();
		});
	});
});
