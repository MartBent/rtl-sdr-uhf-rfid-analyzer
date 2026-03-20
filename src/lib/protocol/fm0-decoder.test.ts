import { describe, it, expect } from 'vitest';
import { Fm0Decoder } from './fm0-decoder';

// FM0 preamble pattern: {1,1,-1,1,-1,-1,1,-1,-1,-1,1,1}
const FM0_PREAMBLE = [1, 1, -1, 1, -1, -1, 1, -1, -1, -1, 1, 1];

/**
 * Generate synthetic FM0-encoded samples using the decoder's exact
 * fractional sample spacing (sampleRate / blf).
 *
 * FM0 encoding rules:
 * - Every symbol boundary: mandatory phase inversion
 * - data-0: additional phase inversion at mid-symbol
 * - data-1: no mid-symbol inversion
 *
 * We first emit the preamble pattern (12 half-bit-period samples), then
 * encode data bits using FM0 rules. Uses fractional sample positions
 * (filled to nearest integer boundaries) to match decoder's correlator grid.
 */
function generateFm0Samples(
	dataBits: number[],
	blf: number,
	sampleRate: number,
	amplitude: number = 1.0
): Float32Array {
	const samplesPerBit = sampleRate / blf;
	const samplesPerHalfBit = samplesPerBit / 2;
	const preambleEndSample = Math.round(FM0_PREAMBLE.length * samplesPerHalfBit);
	const dataEndSample = preambleEndSample + Math.round(dataBits.length * samplesPerBit);
	const totalLen = dataEndSample + Math.round(samplesPerBit * 2); // padding
	const samples = new Float32Array(totalLen);

	// Write preamble: each element of FM0_PREAMBLE is a half-bit-period level.
	// Fill from floor(start) to floor(next start) for each half-bit.
	for (let i = 0; i < FM0_PREAMBLE.length; i++) {
		const level = FM0_PREAMBLE[i] * amplitude;
		const start = Math.round(i * samplesPerHalfBit);
		const end = Math.round((i + 1) * samplesPerHalfBit);
		for (let s = start; s < end && s < samples.length; s++) {
			samples[s] = level;
		}
	}

	// Encode data bits after preamble using FM0 rules.
	// Track the current level state from end of preamble.
	let currentLevel = FM0_PREAMBLE[FM0_PREAMBLE.length - 1] * amplitude;

	for (let b = 0; b < dataBits.length; b++) {
		const bitStartF = preambleEndSample + b * samplesPerBit;
		const bitMidF = bitStartF + samplesPerHalfBit;
		const bitEndF = bitStartF + samplesPerBit;

		const bitStart = Math.round(bitStartF);
		const bitMid = Math.round(bitMidF);
		const bitEnd = Math.round(bitEndF);

		// Symbol boundary: mandatory phase inversion
		currentLevel = -currentLevel;
		const firstHalfLevel = currentLevel;

		if (dataBits[b] === 0) {
			// data-0: mid-symbol inversion
			const secondHalfLevel = -currentLevel;
			currentLevel = secondHalfLevel;

			for (let s = bitStart; s < bitMid && s < samples.length; s++) {
				samples[s] = firstHalfLevel;
			}
			for (let s = bitMid; s < bitEnd && s < samples.length; s++) {
				samples[s] = secondHalfLevel;
			}
		} else {
			// data-1: no mid-symbol inversion (constant level throughout symbol)
			for (let s = bitStart; s < bitEnd && s < samples.length; s++) {
				samples[s] = firstHalfLevel;
			}
		}
	}

	return samples;
}

describe('Fm0Decoder', () => {
	const decoder = new Fm0Decoder();
	// Use BLF that divides evenly into sample rate for cleaner tests
	const BLF = 300_000; // 300 kHz -> samplesPerBit = 8 (integer)
	const SAMPLE_RATE = 2_400_000; // 2.4 MSPS

	it('decodes known bit pattern from synthetic FM0 signal with high confidence', () => {
		const knownBits = [1, 0, 1, 1, 0, 0, 1, 0];
		const samples = generateFm0Samples(knownBits, BLF, SAMPLE_RATE, 1.0);

		const result = decoder.decode(samples, BLF, SAMPLE_RATE, 0);

		expect(result).not.toBeNull();
		expect(result!.confidence).toBeGreaterThan(0.5);
		expect(result!.encoding).toBe('FM0');
		// Check decoded bits match input
		expect(result!.bits.length).toBeGreaterThanOrEqual(knownBits.length);
		for (let i = 0; i < knownBits.length; i++) {
			expect(result!.bits[i]).toBe(knownBits[i]);
		}
	});

	it('returns null for random noise samples (confidence below 50%)', () => {
		// Use a seeded deterministic noise pattern to avoid flaky tests.
		// Fill with alternating small values that have no FM0 structure.
		const noiseSamples = new Float32Array(500);
		let seed = 42;
		for (let i = 0; i < noiseSamples.length; i++) {
			// Simple LCG PRNG for deterministic "noise"
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			noiseSamples[i] = ((seed / 0x7fffffff) - 0.5) * 0.01; // very low amplitude
		}

		const result = decoder.decode(noiseSamples, BLF, SAMPLE_RATE, 0);
		expect(result).toBeNull();
	});

	it('returns BackscatterResult with encoding FM0 and confidence in 0-1 range', () => {
		const knownBits = [1, 1, 0, 1];
		const samples = generateFm0Samples(knownBits, BLF, SAMPLE_RATE, 1.0);

		const result = decoder.decode(samples, BLF, SAMPLE_RATE, 100);

		expect(result).not.toBeNull();
		expect(result!.encoding).toBe('FM0');
		expect(result!.confidence).toBeGreaterThanOrEqual(0);
		expect(result!.confidence).toBeLessThanOrEqual(1);
		expect(result!.sampleOffset).toBeGreaterThan(0);
	});

	it('returns null for empty or too-short samples', () => {
		const empty = new Float32Array(0);
		expect(decoder.decode(empty, BLF, SAMPLE_RATE, 0)).toBeNull();

		const tooShort = new Float32Array(5);
		expect(decoder.decode(tooShort, BLF, SAMPLE_RATE, 0)).toBeNull();
	});

	it('confidence is higher for clean signal than noisy signal', () => {
		const knownBits = [1, 0, 1, 0];

		// Clean signal
		const cleanSamples = generateFm0Samples(knownBits, BLF, SAMPLE_RATE, 1.0);
		const cleanResult = decoder.decode(cleanSamples, BLF, SAMPLE_RATE, 0);

		// Noisy signal -- lower amplitude with additive noise
		const noisySamples = generateFm0Samples(knownBits, BLF, SAMPLE_RATE, 0.3);
		let seed = 123;
		for (let i = 0; i < noisySamples.length; i++) {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			noisySamples[i] += ((seed / 0x7fffffff) - 0.5) * 0.2;
		}
		const noisyResult = decoder.decode(noisySamples, BLF, SAMPLE_RATE, 0);

		expect(cleanResult).not.toBeNull();
		// Noisy result might be null or have lower confidence
		if (noisyResult !== null) {
			expect(cleanResult!.confidence).toBeGreaterThanOrEqual(noisyResult.confidence);
		}
	});
});
