/**
 * Frame Sync Detector for EPC Gen2 PIE encoding
 *
 * Detects preamble and frame-sync patterns from demodulated symbols,
 * extracts adaptive Tari timing, and classifies data symbols.
 *
 * Preamble: Delimiter + data-0 + RTcal + TRcal  (precedes Query only)
 * Frame-Sync: Delimiter + data-0 + RTcal         (precedes all other commands)
 *
 * Tari is extracted from the data-0 duration in the preamble/frame-sync.
 * Pivot = RTcal / 2 is used for subsequent symbol classification.
 */

import type { DemodSymbol, FrameSyncResult } from './gen2-types';

/** Fixed delimiter duration: 12.5us */
const DELIMITER_US = 12.5e-6;
/** Delimiter tolerance: +/-20% */
const DELIMITER_TOLERANCE = 0.2;

export class FrameSyncDetector {
	private sampleRate: number;
	private delimiterNominal: number; // nominal delimiter duration in samples
	private delimiterMin: number;
	private delimiterMax: number;

	constructor(sampleRate: number) {
		this.sampleRate = sampleRate;
		this.delimiterNominal = DELIMITER_US * sampleRate;
		this.delimiterMin = this.delimiterNominal * (1 - DELIMITER_TOLERANCE);
		this.delimiterMax = this.delimiterNominal * (1 + DELIMITER_TOLERANCE);
	}

	/**
	 * Process a sequence of demod symbols looking for preamble or frame-sync.
	 * Returns null if no sync found, or FrameSyncResult with extracted timing.
	 *
	 * Expected symbol sequence:
	 *   [0] Delimiter (pulse-low, ~12.5us)
	 *   [1] data-0    (pulse-high, Tari duration)
	 *   [2] RTcal     (pulse-low, data-0 + data-1 duration)
	 *   [3] TRcal     (pulse-high, if preamble) OR first data symbol (if frame-sync)
	 */
	processSymbols(symbols: DemodSymbol[]): FrameSyncResult | null {
		// Need at least 3 symbols: delimiter + data-0 + RTcal
		if (symbols.length < 3) {
			return null;
		}

		// Symbol 0: Delimiter (must be pulse-low with correct duration)
		const delimiter = symbols[0];
		if (delimiter.type !== 'pulse-low') {
			return null;
		}
		if (
			delimiter.durationSamples < this.delimiterMin ||
			delimiter.durationSamples > this.delimiterMax
		) {
			return null;
		}

		// Symbol 1: data-0 (Tari) - pulse-high
		const data0 = symbols[1];
		const tariSamples = data0.durationSamples;

		// Symbol 2: RTcal - pulse-low
		const rtcal = symbols[2];
		const rtcalSamples = rtcal.durationSamples;
		const pivotSamples = rtcalSamples / 2;

		// Determine if preamble or frame-sync by checking symbol 3
		if (symbols.length >= 4) {
			const sym3 = symbols[3];
			// TRcal should be longer than RTcal (it encodes BLF)
			// If the 4th symbol is significantly longer than RTcal, it's TRcal (preamble)
			// If it's shorter than RTcal, it's a data symbol (frame-sync)
			if (sym3.durationSamples > rtcalSamples) {
				// Preamble: has TRcal
				const trcalSamples = sym3.durationSamples;
				const trcalSeconds = trcalSamples / this.sampleRate;
				// BLF = DR / TRcal. Default DR=8 (most common)
				const blf = 8 / trcalSeconds;

				return {
					type: 'preamble',
					tariSamples,
					pivotSamples,
					blf,
					sampleOffset: delimiter.sampleOffset,
					dataStartIndex: 4,
				};
			}
		}

		// Frame-sync (no TRcal, or 4th symbol is data)
		return {
			type: 'frame-sync',
			tariSamples,
			pivotSamples,
			sampleOffset: delimiter.sampleOffset,
			dataStartIndex: 3,
		};
	}

	/**
	 * Classify data symbols after sync using the pivot threshold.
	 * @param symbols - Array of demod symbols (data portion only)
	 * @param pivot - Pivot threshold in samples (RTcal / 2)
	 * @returns Array of 0s and 1s
	 */
	classifySymbols(symbols: DemodSymbol[], pivot: number): number[] {
		const bits: number[] = [];
		for (const sym of symbols) {
			bits.push(sym.durationSamples < pivot ? 0 : 1);
		}
		return bits;
	}
}
