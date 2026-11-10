/**
 * Frame Sync Detector for EPC Gen2 PIE encoding
 *
 * Streaming scanner that detects preamble and frame-sync patterns from
 * demodulated symbols, extracts adaptive Tari timing, and classifies
 * data symbols.
 *
 * Key design: accumulates residual symbols across calls so commands
 * spanning buffer boundaries are never missed. Returns ALL sync results
 * found in each call, not just the first.
 *
 * ---------------------------------------------------------------------------
 * Run stream vs PIE symbols — read this before touching the indexing.
 *
 * The WASM demodulator emits *runs*: one entry per envelope edge, strictly
 * alternating pulse-high / pulse-low. A PIE symbol is TWO runs — a high
 * period followed by its PW low pulse — and the quantity Gen2 timing is
 * defined on is the FULL symbol duration (high + PW), not the high alone.
 *
 *   delimiter   data-0        RTcal          TRcal        bit   bit
 *    ──┐      ┌────┐ ┌──────────┐ ┌────────────┐ ┌───┐ ┌─────┐ ┌─
 *      └──────┘    └─┘          └─┘            └─┘   └─┘     └─┘
 *      12.5µs  └─ 1 symbol ─┘  └── 1 symbol ──┘
 *
 * So, counting runs from the delimiter at index i:
 *   i     delimiter (pulse-low, ~12.5us, NOT part of a symbol)
 *   i+1,2 data-0 — its full duration IS Tari
 *   i+3,4 RTcal  — data-0 + data-1
 *   i+5,6 TRcal  — preamble (Query) only; absent on a frame-sync
 *   then  one pair per data bit
 *
 * Earlier revisions treated each run as a whole symbol, which made
 * `stream[i+2]` (the PW low pulse) stand in for RTcal. The resulting
 * RTcal/Tari ratio is ~0.4-1.1 and can never pass the 2.3-3.3 spec check,
 * so sync never fired on real captures.
 * ---------------------------------------------------------------------------
 */

import type { DemodSymbol, FrameSyncResult } from './gen2-types';

/** Fixed delimiter duration: 12.5us */
const DELIMITER_US = 12.5e-6;
/** Delimiter tolerance: +/-20% */
const DELIMITER_TOLERANCE = 0.2;
/** Runs per PIE symbol: one pulse-high + its PW pulse-low. */
const RUNS_PER_SYMBOL = 2;
/**
 * Upper bound on the runs one command may span before we give up on a
 * delimiter. Guards the residual buffer against unbounded growth when noise
 * produces a delimiter-shaped gap that is never followed by a real command.
 */
const MAX_COMMAND_RUNS = 4096;

/** A PIE symbol: one high period plus the PW low pulse that closes it. */
interface PieSymbol {
	/** Full symbol duration (high + PW) — what Gen2 timing is defined on. */
	totalSamples: number;
	sampleOffset: number;
}

/**
 * Pair the run at `k` with the one at `k+1` into a single PIE symbol.
 * Returns null if the pair is incomplete or has the wrong polarity.
 */
function pairSymbolAt(stream: DemodSymbol[], k: number): PieSymbol | null {
	if (k < 0 || k + 1 >= stream.length) return null;
	const high = stream[k];
	const low = stream[k + 1];
	if (high.type !== 'pulse-high' || low.type !== 'pulse-low') return null;
	return {
		totalSamples: high.durationSamples + low.durationSamples,
		sampleOffset: high.sampleOffset,
	};
}

export class FrameSyncDetector {
	private sampleRate: number;
	private delimiterNominal: number; // nominal delimiter duration in samples
	private delimiterMin: number;
	private delimiterMax: number;
	private residualSymbols: DemodSymbol[] = [];
	private lastTariSamples: number = 0;

	constructor(sampleRate: number) {
		this.sampleRate = sampleRate;
		this.delimiterNominal = DELIMITER_US * sampleRate;
		this.delimiterMin = this.delimiterNominal * (1 - DELIMITER_TOLERANCE);
		this.delimiterMax = this.delimiterNominal * (1 + DELIMITER_TOLERANCE);
	}

	/**
	 * Process a sequence of demod runs, scanning for all preamble/frame-sync
	 * patterns. Carries residual runs across calls for continuity.
	 *
	 * Returns an array of FrameSyncResult (empty if no sync found).
	 * Each result includes `dataSymbols` — the raw runs following that sync
	 * up to the next delimiter or end of command. Pass them to
	 * `classifySymbols()`, which does the pairing.
	 */
	processSymbols(symbols: DemodSymbol[]): FrameSyncResult[] {
		// Merge residual runs from previous call with new runs
		const stream = this.residualSymbols.concat(symbols);
		this.residualSymbols = [];

		const results: FrameSyncResult[] = [];
		let i = 0;

		while (i < stream.length) {
			// Scan for a delimiter: pulse-low with correct duration
			const delimiter = stream[i];
			if (
				delimiter.type !== 'pulse-low' ||
				delimiter.durationSamples < this.delimiterMin ||
				delimiter.durationSamples > this.delimiterMax
			) {
				i++;
				continue;
			}

			// Minimum viable sync: delimiter + data-0 pair + RTcal pair = 5 runs,
			// plus one more pair to tell preamble from frame-sync = 7 runs.
			if (i + 6 >= stream.length) {
				this.residualSymbols = stream.slice(i);
				return results;
			}

			const data0 = pairSymbolAt(stream, i + 1);
			const rtcal = pairSymbolAt(stream, i + 1 + RUNS_PER_SYMBOL);
			if (!data0 || !rtcal) {
				i++;
				continue;
			}

			const tariSamples = data0.totalSamples;
			const rtcalSamples = rtcal.totalSamples;
			const pivotSamples = rtcalSamples / 2;

			// --- Gen2 spec timing validation ---
			// Tari must be 6.25-25us (with margin: 6.0-27.0us)
			const tariUs = (tariSamples / this.sampleRate) * 1e6;
			if (tariUs < 6.0 || tariUs > 27.0) {
				i++;
				continue;
			}
			// RTcal = data-0 + data-1, and data-1 is 1.5-2.0x Tari,
			// so RTcal/Tari is 2.5-3.0 (with margin: 2.3-3.3)
			const rtcalRatio = rtcalSamples / tariSamples;
			if (rtcalRatio < 2.3 || rtcalRatio > 3.3) {
				i++;
				continue;
			}

			// Third symbol after the delimiter is TRcal (preamble) or the first
			// data bit (frame-sync). TRcal exceeds RTcal; a data symbol never
			// does (data-1 is at most 2x Tari, i.e. ~0.8x RTcal).
			const third = pairSymbolAt(stream, i + 1 + 2 * RUNS_PER_SYMBOL);
			if (!third) {
				i++;
				continue;
			}

			let syncType: 'preamble' | 'frame-sync';
			let blf: number | undefined;
			let dataStart: number; // run index where data symbols begin

			if (third.totalSamples > rtcalSamples) {
				// Preamble: has TRcal
				// TRcal/RTcal ratio must be 1.1-3.0 (with margin: 1.0-3.3)
				const trcalRatio = third.totalSamples / rtcalSamples;
				if (trcalRatio < 1.0 || trcalRatio > 3.3) {
					i++;
					continue;
				}
				blf = 8 / (third.totalSamples / this.sampleRate);
				syncType = 'preamble';
				dataStart = i + 1 + 3 * RUNS_PER_SYMBOL;
			} else {
				syncType = 'frame-sync';
				dataStart = i + 1 + 2 * RUNS_PER_SYMBOL;
			}

			// Collect data symbols up to the end of the command.
			// Per Gen2 spec, any symbol exceeding 4xRTcal is invalid — that is
			// how the trailing CW period (which closes every command) is found.
			const maxSymbolSamples = 4 * rtcalSamples;
			let dataEnd = dataStart;
			let terminated = false;
			while (dataEnd + 1 < stream.length) {
				const pair = pairSymbolAt(stream, dataEnd);
				if (!pair || pair.totalSamples > maxSymbolSamples) {
					terminated = true;
					break;
				}
				dataEnd += RUNS_PER_SYMBOL;
			}

			if (!terminated) {
				// Ran out of runs mid-command. Keep everything from the delimiter
				// so the next call can finish it rather than emitting a truncated
				// command that would only fail CRC.
				if (stream.length - i <= MAX_COMMAND_RUNS) {
					this.residualSymbols = stream.slice(i);
					return results;
				}
				// Implausibly long: this delimiter was noise, not a command.
				i++;
				continue;
			}

			this.lastTariSamples = tariSamples;

			const result: FrameSyncResult = {
				type: syncType,
				tariSamples,
				pivotSamples,
				sampleOffset: delimiter.sampleOffset,
				dataStartIndex: dataStart - i,
				dataSymbols: stream.slice(dataStart, dataEnd),
			};
			if (blf !== undefined) {
				result.blf = blf;
			}
			results.push(result);

			// Advance past this command's data to look for the next delimiter
			i = dataEnd;
		}

		// No residual if we consumed everything
		return results;
	}

	/**
	 * Get the last detected Tari in microseconds.
	 */
	getLastTariUs(): number {
		if (this.lastTariSamples === 0 || this.sampleRate === 0) return 0;
		return (this.lastTariSamples / this.sampleRate) * 1e6;
	}

	/**
	 * Reset residual state (call on capture stop/restart).
	 */
	reset(): void {
		this.residualSymbols = [];
		this.lastTariSamples = 0;
	}

	/**
	 * Classify data symbols after sync using the pivot threshold.
	 *
	 * Takes the raw run stream and pairs it into PIE symbols, comparing each
	 * symbol's FULL duration (high + PW) against the pivot. Comparing the high
	 * run alone against a pivot derived from full durations would shift every
	 * bit decision by PW.
	 *
	 * @param symbols - Raw runs (data portion only), starting on a pulse-high
	 * @param pivot - Pivot threshold in samples (RTcal / 2)
	 * @returns Array of 0s and 1s
	 */
	classifySymbols(symbols: DemodSymbol[], pivot: number): number[] {
		const bits: number[] = [];
		for (let k = 0; k + 1 < symbols.length; k += RUNS_PER_SYMBOL) {
			const pair = pairSymbolAt(symbols, k);
			if (!pair) break;
			bits.push(pair.totalSamples < pivot ? 0 : 1);
		}
		return bits;
	}
}
