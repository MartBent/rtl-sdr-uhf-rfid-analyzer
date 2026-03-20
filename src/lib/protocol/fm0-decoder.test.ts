import { describe, it, expect } from 'vitest';
import { Fm0Decoder } from './fm0-decoder';

// FM0 preamble pattern: {1,1,-1,1,-1,-1,1,-1,-1,-1,1,1}
const FM0_PREAMBLE = [1, 1, -1, 1, -1, -1, 1, -1, -1, -1, 1, 1];

/**
 * Generate synthetic FM0-encoded samples.
 *
 * FM0 encoding rules:
 * - Every symbol boundary: mandatory phase inversion
 * - data-0: additional phase inversion at mid-symbol
 * - data-1: no mid-symbol inversion
 *
 * We first emit the preamble pattern (12 half-bit samples), then
 * encode data bits using FM0 rules.
 */
function generateFm0Samples(
	dataBits: number[],
	samplesPerBit: number,
	amplitude: number = 1.0
): Float32Array {
	const halfBit = Math.round(samplesPerBit / 2);
	const preambleLen = FM0_PREAMBLE.length * halfBit;
	const dataLen = dataBits.length * samplesPerBit;
	const totalLen = preambleLen + dataLen + samplesPerBit * 2; // extra padding
	const samples = new Float32Array(totalLen);

	// Write preamble: each element of FM0_PREAMBLE is a half-bit-period level
	for (let i = 0; i < FM0_PREAMBLE.length; i++) {
		const level = FM0_PREAMBLE[i] * amplitude;
		const start = i * halfBit;
		for (let s = 0; s < halfBit; s++) {
			if (start + s < samples.length) {
				samples[start + s] = level;
			}
		}
	}

	// Encode data bits after preamble using FM0 rules
	// Track the current level state from end of preamble
	let currentLevel = FM0_PREAMBLE[FM0_PREAMBLE.length - 1] * amplitude; // last preamble level

	for (let b = 0; b < dataBits.length; b++) {
		const bitStart = preambleLen + b * samplesPerBit;

		// Symbol boundary: mandatory phase inversion
		currentLevel = -currentLevel;
		const firstHalfLevel = currentLevel;

		if (dataBits[b] === 0) {
			// data-0: mid-symbol inversion
			const secondHalfLevel = -currentLevel;
			currentLevel = secondHalfLevel;

			// First half
			for (let s = 0; s < halfBit; s++) {
				if (bitStart + s < samples.length) {
					samples[bitStart + s] = firstHalfLevel;
				}
			}
			// Second half
			for (let s = halfBit; s < samplesPerBit; s++) {
				if (bitStart + s < samples.length) {
					samples[bitStart + s] = secondHalfLevel;
				}
			}
		} else {
			// data-1: no mid-symbol inversion (constant level throughout symbol)
			for (let s = 0; s < samplesPerBit; s++) {
				if (bitStart + s < samples.length) {
					samples[bitStart + s] = firstHalfLevel;
				}
			}
		}
	}

	return samples;
}

describe('Fm0Decoder', () => {
	const decoder = new Fm0Decoder();
	const BLF = 640_000; // 640 kHz backscatter link frequency
	const SAMPLE_RATE = 2_400_000; // 2.4 MSPS

	it('decodes known bit pattern from synthetic FM0 signal with high confidence', () => {
		const knownBits = [1, 0, 1, 1, 0, 0, 1, 0];
		const samplesPerBit = Math.round(SAMPLE_RATE / BLF);
		const samples = generateFm0Samples(knownBits, samplesPerBit, 1.0);

		const result = decoder.decode(samples, BLF, SAMPLE_RATE, 0);

		expect(result).not.toBeNull();
		expect(result!.confidence).toBeGreaterThan(0.5);
		expect(result!.encoding).toBe('FM0');
		// Check at least the first few decoded bits match
		expect(result!.bits.length).toBeGreaterThanOrEqual(knownBits.length);
		for (let i = 0; i < knownBits.length; i++) {
			expect(result!.bits[i]).toBe(knownBits[i]);
		}
	});

	it('returns null for random noise samples (confidence below 50%)', () => {
		const noiseSamples = new Float32Array(1000);
		for (let i = 0; i < noiseSamples.length; i++) {
			noiseSamples[i] = (Math.random() - 0.5) * 0.1; // low-amplitude noise
		}

		const result = decoder.decode(noiseSamples, BLF, SAMPLE_RATE, 0);
		expect(result).toBeNull();
	});

	it('returns BackscatterResult with encoding FM0 and confidence in 0-1 range', () => {
		const knownBits = [1, 1, 0, 1];
		const samplesPerBit = Math.round(SAMPLE_RATE / BLF);
		const samples = generateFm0Samples(knownBits, samplesPerBit, 1.0);

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
		const samplesPerBit = Math.round(SAMPLE_RATE / BLF);

		// Clean signal
		const cleanSamples = generateFm0Samples(knownBits, samplesPerBit, 1.0);
		const cleanResult = decoder.decode(cleanSamples, BLF, SAMPLE_RATE, 0);

		// Noisy signal - add noise to the clean signal
		const noisySamples = generateFm0Samples(knownBits, samplesPerBit, 0.3);
		for (let i = 0; i < noisySamples.length; i++) {
			noisySamples[i] += (Math.random() - 0.5) * 0.2;
		}
		const noisyResult = decoder.decode(noisySamples, BLF, SAMPLE_RATE, 0);

		expect(cleanResult).not.toBeNull();
		// Noisy result might be null or have lower confidence
		if (noisyResult !== null) {
			expect(cleanResult!.confidence).toBeGreaterThanOrEqual(noisyResult.confidence);
		}
	});
});
