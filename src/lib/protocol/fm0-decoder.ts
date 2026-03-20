/**
 * FM0 Backscatter Decoder (Experimental)
 *
 * Attempts to decode FM0-encoded tag backscatter from baseband samples.
 * Uses correlation-based preamble detection and differential bit decoding.
 *
 * FM0 encoding rules:
 * - Every symbol boundary: mandatory phase inversion
 * - data-0: additional phase inversion at mid-symbol
 * - data-1: no mid-symbol inversion
 *
 * FM0 Preamble: 1010v1 (v = violation = missing boundary transition)
 * Correlation pattern: {1,1,-1,1,-1,-1,1,-1,-1,-1,1,1} (12 half-bit-periods)
 *
 * WARNING: This is experimental. RTL-SDR has ~48 dB dynamic range while tag
 * backscatter is 60-80 dB below reader signal. Expect this to work only in
 * ideal conditions (close proximity, strong tag, low noise).
 */

import type { BackscatterResult } from './gen2-types';

// FM0 preamble correlation pattern (12 half-bit-period levels)
const FM0_PREAMBLE = [1, 1, -1, 1, -1, -1, 1, -1, -1, -1, 1, 1];

// Discard results below this confidence threshold
const MIN_CONFIDENCE = 0.5;

// Minimum channel amplitude to consider a signal present (not noise)
const MIN_CHANNEL_AMPLITUDE = 0.05;

export class Fm0Decoder {
	/**
	 * Attempt FM0 decode on baseband samples after reader command ends.
	 *
	 * @param samples - Float32Array of baseband envelope samples (post-reader silence region)
	 * @param blf - Backscatter Link Frequency in Hz (from preamble TRcal)
	 * @param sampleRate - Sample rate in Hz
	 * @param sampleOffset - Global sample offset for timing
	 * @returns BackscatterResult or null if confidence too low
	 */
	decode(
		samples: Float32Array,
		blf: number,
		sampleRate: number,
		sampleOffset: number
	): BackscatterResult | null {
		const samplesPerBit = sampleRate / blf;
		const samplesPerHalfBit = samplesPerBit / 2;

		// Step 1: Check minimum sample length
		const preambleLen = FM0_PREAMBLE.length * samplesPerHalfBit;
		if (samples.length < preambleLen + samplesPerBit * 2) return null;

		// Step 2: Correlate against FM0 preamble to find frame start
		// Uses normalized cross-correlation: corr / (norm_preamble * norm_signal)
		let bestCorr = -Infinity;
		let bestOffset = 0;
		let bestNormCorr = 0;
		const searchEnd = Math.floor(samples.length - preambleLen);

		if (searchEnd <= 0) return null;

		// Preamble energy (constant)
		let preambleEnergy = 0;
		for (const p of FM0_PREAMBLE) preambleEnergy += p * p;

		for (let offset = 0; offset < searchEnd; offset++) {
			let corr = 0;
			let signalEnergy = 0;
			for (let k = 0; k < FM0_PREAMBLE.length; k++) {
				const sampleIdx = Math.round(offset + k * samplesPerHalfBit);
				if (sampleIdx < samples.length) {
					const s = samples[sampleIdx];
					corr += s * FM0_PREAMBLE[k];
					signalEnergy += s * s;
				}
			}

			// Normalized correlation: [-1, 1]
			const denom = Math.sqrt(preambleEnergy * signalEnergy);
			const normCorr = denom > 0 ? corr / denom : 0;
			const absNormCorr = Math.abs(normCorr);

			if (absNormCorr > bestNormCorr) {
				bestNormCorr = absNormCorr;
				bestCorr = corr;
				bestOffset = offset;
			}
		}

		// Step 3: Estimate channel sign and amplitude from preamble
		// Use the sign of bestCorr to determine if signal is inverted
		const signFlip = bestCorr < 0 ? -1 : 1;

		// Compute average amplitude at known positive preamble positions
		const preamblePositiveIndices = [0, 1, 3, 6, 10, 11]; // where FM0_PREAMBLE is +1
		let channelAmp = 0;
		for (const pos of preamblePositiveIndices) {
			const sampleIdx = Math.round(bestOffset + pos * samplesPerHalfBit);
			if (sampleIdx < samples.length) {
				channelAmp += samples[sampleIdx] * signFlip;
			}
		}
		channelAmp /= preamblePositiveIndices.length;

		// Reject if channel amplitude is too low (noise-only signal)
		if (channelAmp < MIN_CHANNEL_AMPLITUDE) return null;

		// Step 4: Decode data bits after preamble using differential detection
		const dataStart = bestOffset + FM0_PREAMBLE.length * samplesPerHalfBit;
		const bits: number[] = [];

		for (
			let bitIdx = 0;
			dataStart + (bitIdx + 1) * samplesPerBit < samples.length;
			bitIdx++
		) {
			const s1Idx = Math.round(dataStart + bitIdx * samplesPerBit);
			const s2Idx = Math.round(dataStart + bitIdx * samplesPerBit + samplesPerHalfBit);

			if (s1Idx >= samples.length || s2Idx >= samples.length) break;

			const s1 = samples[s1Idx] * signFlip;
			const s2 = samples[s2Idx] * signFlip;

			// FM0: data-0 has mid-symbol inversion, data-1 does not
			// Check if the two half-bit samples have different signs
			const hasMidInversion = Math.sign(s1) !== Math.sign(s2);
			bits.push(hasMidInversion ? 0 : 1);

			if (bits.length > 256) break; // safety limit
		}

		// Step 5: Confidence is the normalized correlation (already in [0, 1])
		const confidence = Math.min(bestNormCorr, 1.0);

		if (confidence < MIN_CONFIDENCE) return null;

		return {
			bits,
			confidence,
			encoding: 'FM0',
			sampleOffset: sampleOffset + Math.round(dataStart),
		};
	}
}
