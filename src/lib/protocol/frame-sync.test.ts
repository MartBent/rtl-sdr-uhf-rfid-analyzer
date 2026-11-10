import { describe, it, expect } from 'vitest';
import { FrameSyncDetector } from './frame-sync';
import type { DemodSymbol } from './gen2-types';

/**
 * Fixtures are generated as a RUN STREAM — exactly what the WASM demodulator
 * emits: one entry per envelope edge, strictly alternating high/low.
 *
 * A PIE symbol is two runs: a high period of (duration - PW) followed by the
 * PW low pulse that closes it. The delimiter is the one exception — a bare
 * 12.5us low with no high half.
 *
 * Do not hand-write symbol arrays here. An earlier revision of this file built
 * RTcal as a single 31us *pulse-low*, which cannot occur on the air (it is
 * longer than the delimiter), and that fiction is what let a broken detector
 * pass its own suite. Everything below comes out of buildCommand().
 */

const SAMPLE_RATE = 2_400_000;

/** Microseconds -> samples at the fixture sample rate. */
const us = (v: number): number => Math.round(v * 1e-6 * SAMPLE_RATE);

const DELIMITER_US = 12.5;

interface CommandOpts {
	/** Tari in microseconds (spec: 6.25-25). */
	tariUs?: number;
	/** data-1 as a multiple of Tari (spec: 1.5-2.0). RTcal = Tari + data-1. */
	data1Factor?: number;
	/** TRcal in microseconds. Present => preamble (Query); absent => frame-sync. */
	trcalUs?: number;
	/** Data bits following the sync. */
	bits?: number[];
	/** PW as a fraction of Tari (spec: 0.265-0.525). */
	pwRatio?: number;
	/** Delimiter length in microseconds (override to test tolerance). */
	delimiterUs?: number;
	/** Append the trailing CW period that closes every real command. */
	terminate?: boolean;
	/** Absolute sample offset the command starts at. */
	startOffset?: number;
}

/** Build a run stream from a list of [polarity, duration] pairs. */
function runs(parts: Array<['high' | 'low', number]>, startOffset: number): DemodSymbol[] {
	let offset = startOffset;
	return parts.map(([polarity, durationSamples]) => {
		const sym: DemodSymbol = {
			type: polarity === 'high' ? 'pulse-high' : 'pulse-low',
			sampleOffset: offset,
			durationSamples,
			amplitude: 1.0,
		};
		offset += durationSamples;
		return sym;
	});
}

/**
 * Build the run stream for one reader command.
 *
 * delimiter | data-0 | RTcal | [TRcal] | bits... | trailing CW
 */
function buildCommand(opts: CommandOpts = {}): DemodSymbol[] {
	const {
		tariUs = 12.5,
		data1Factor = 1.5,
		trcalUs,
		bits = [],
		pwRatio = 0.3,
		delimiterUs = DELIMITER_US,
		terminate = true,
		startOffset = 0,
	} = opts;

	const tari = us(tariUs);
	const pw = Math.round(tari * pwRatio);
	const data1 = Math.round(tari * data1Factor);
	const rtcal = tari + data1;

	const parts: Array<['high' | 'low', number]> = [['low', us(delimiterUs)]];
	/** Emit one PIE symbol of total duration `total` as its two runs. */
	const symbol = (total: number): void => {
		parts.push(['high', total - pw], ['low', pw]);
	};

	symbol(tari); // data-0: its full duration IS Tari
	symbol(rtcal); // RTcal = data-0 + data-1
	if (trcalUs !== undefined) symbol(us(trcalUs)); // TRcal (preamble only)
	for (const bit of bits) symbol(bit === 0 ? tari : data1);

	if (terminate) {
		// Carrier returns for the tag response window: one over-long symbol,
		// which is how the scanner knows the command ended. Sized against RTcal
		// so it clears the 4x RTcal limit at every Tari.
		parts.push(['high', rtcal * 8], ['low', pw]);
	}

	return runs(parts, startOffset);
}

/** Total length in samples of a built command, for chaining offsets. */
function spanOf(stream: DemodSymbol[]): number {
	const last = stream[stream.length - 1];
	return last.sampleOffset + last.durationSamples - stream[0].sampleOffset;
}

// Reference numbers at Tari = 12.5us, 2.4 MSPS:
//   Tari = 30 samples, PW = 9, data-1 = 45, RTcal = 75, pivot = 37.5
const TARI_SAMPLES = us(12.5); // 30
const RTCAL_SAMPLES = TARI_SAMPLES + Math.round(TARI_SAMPLES * 1.5); // 75
const PIVOT_SAMPLES = RTCAL_SAMPLES / 2; // 37.5
/** TRcal = 2x RTcal -> ratio 2.0, BLF = 8 / 62.5us = 128 kHz */
const TRCAL_US = 62.5;

describe('FrameSyncDetector', () => {
	describe('preamble detection (Query)', () => {
		it('detects a preamble with correct Tari and pivot', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const results = detector.processSymbols(
				buildCommand({ trcalUs: TRCAL_US, bits: [0, 1, 0, 1] })
			);

			expect(results).toHaveLength(1);
			expect(results[0].type).toBe('preamble');
			expect(results[0].tariSamples).toBe(TARI_SAMPLES);
			expect(results[0].pivotSamples).toBe(PIVOT_SAMPLES);
			// delimiter(1) + data-0(2) + RTcal(2) + TRcal(2) = 7 runs
			expect(results[0].dataStartIndex).toBe(7);
		});

		it('extracts BLF from TRcal with DR=8', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const results = detector.processSymbols(
				buildCommand({ trcalUs: TRCAL_US, bits: [1, 0] })
			);

			expect(results[0].blf).toBeDefined();
			// BLF = 8 / TRcal = 8 / 62.5us = 128 kHz
			expect(results[0].blf).toBeCloseTo(128_000, -2);
		});

		it('detects preamble at Tari = 25us', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const results = detector.processSymbols(
				buildCommand({ tariUs: 25, trcalUs: 125, bits: [0, 1] })
			);

			expect(results).toHaveLength(1);
			expect(results[0].type).toBe('preamble');
			expect(results[0].tariSamples).toBe(us(25));
			expect(detector.getLastTariUs()).toBeCloseTo(25, 5);
		});
	});

	describe('frame-sync detection (non-Query commands)', () => {
		it('detects frame-sync with no TRcal', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const results = detector.processSymbols(buildCommand({ bits: [1, 1, 0, 0] }));

			expect(results).toHaveLength(1);
			expect(results[0].type).toBe('frame-sync');
			expect(results[0].blf).toBeUndefined();
			expect(results[0].tariSamples).toBe(TARI_SAMPLES);
			// delimiter(1) + data-0(2) + RTcal(2) = 5 runs
			expect(results[0].dataStartIndex).toBe(5);
		});

		it('does not mistake a data-1 symbol for TRcal', () => {
			// data-1 is 1.5x Tari — the longest a data symbol gets — and must
			// still be read as data, not as a TRcal that would start a preamble.
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const results = detector.processSymbols(buildCommand({ bits: [1, 1, 1, 1] }));

			expect(results).toHaveLength(1);
			expect(results[0].type).toBe('frame-sync');
			expect(detector.classifySymbols(results[0].dataSymbols ?? [], results[0].pivotSamples))
				.toEqual([1, 1, 1, 1]);
		});
	});

	describe('bit classification round-trip', () => {
		const cases: number[][] = [
			[0, 0, 0, 0],
			[1, 1, 1, 1],
			[1, 0, 1, 1, 0, 0, 1, 0],
			[0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0],
		];

		for (const bits of cases) {
			it(`recovers ${bits.join('')} from a frame-sync command`, () => {
				const detector = new FrameSyncDetector(SAMPLE_RATE);
				const results = detector.processSymbols(buildCommand({ bits }));

				expect(results).toHaveLength(1);
				const decoded = detector.classifySymbols(
					results[0].dataSymbols ?? [],
					results[0].pivotSamples
				);
				expect(decoded).toEqual(bits);
			});
		}

		it('recovers bits after a preamble', () => {
			const bits = [1, 0, 0, 1, 0, 1, 1, 0];
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const results = detector.processSymbols(buildCommand({ trcalUs: TRCAL_US, bits }));

			expect(
				detector.classifySymbols(results[0].dataSymbols ?? [], results[0].pivotSamples)
			).toEqual(bits);
		});

		it('recovers bits at Tari = 6.25us and data-1 = 2.0x Tari', () => {
			const bits = [1, 0, 1, 0, 0, 1];
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const results = detector.processSymbols(
				buildCommand({ tariUs: 6.25, data1Factor: 2.0, bits })
			);

			expect(results).toHaveLength(1);
			expect(
				detector.classifySymbols(results[0].dataSymbols ?? [], results[0].pivotSamples)
			).toEqual(bits);
		});

		it('recovers bits across the legal PW range', () => {
			const bits = [1, 0, 1, 1, 0];
			for (const pwRatio of [0.265, 0.4, 0.525]) {
				const detector = new FrameSyncDetector(SAMPLE_RATE);
				const results = detector.processSymbols(buildCommand({ bits, pwRatio }));

				expect(results, `pwRatio=${pwRatio}`).toHaveLength(1);
				expect(
					detector.classifySymbols(results[0].dataSymbols ?? [], results[0].pivotSamples),
					`pwRatio=${pwRatio}`
				).toEqual(bits);
			}
		});
	});

	describe('delimiter detection', () => {
		it('accepts a delimiter within 20% tolerance', () => {
			for (const delimiterUs of [12.5 * 0.85, 12.5, 12.5 * 1.15]) {
				const detector = new FrameSyncDetector(SAMPLE_RATE);
				const results = detector.processSymbols(buildCommand({ delimiterUs, bits: [0, 1] }));
				expect(results, `delimiter=${delimiterUs}us`).toHaveLength(1);
			}
		});

		it('rejects a delimiter outside tolerance', () => {
			for (const delimiterUs of [12.5 * 0.5, 12.5 * 1.5]) {
				const detector = new FrameSyncDetector(SAMPLE_RATE);
				const results = detector.processSymbols(buildCommand({ delimiterUs, bits: [0, 1] }));
				expect(results, `delimiter=${delimiterUs}us`).toHaveLength(0);
			}
		});

		it('skips noise runs before a valid sync', () => {
			const noise = runs(
				[
					['high', us(3)],
					['low', us(1)],
					['high', us(40)],
					['low', us(2)],
				],
				0
			);
			const command = buildCommand({ bits: [1, 0, 1], startOffset: us(46) });

			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const results = detector.processSymbols(noise.concat(command));

			expect(results).toHaveLength(1);
			expect(results[0].type).toBe('frame-sync');
		});
	});

	describe('Gen2 spec timing validation', () => {
		it('rejects Tari below 6us', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			expect(detector.processSymbols(buildCommand({ tariUs: 4, bits: [0, 1] }))).toHaveLength(0);
		});

		it('rejects Tari above 27us', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			expect(detector.processSymbols(buildCommand({ tariUs: 30, bits: [0, 1] }))).toHaveLength(0);
		});

		it('rejects an RTcal/Tari ratio below 2.3', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			// data-1 = 1.0x Tari -> RTcal/Tari = 2.0
			expect(
				detector.processSymbols(buildCommand({ data1Factor: 1.0, bits: [0, 1] }))
			).toHaveLength(0);
		});

		it('rejects an RTcal/Tari ratio above 3.3', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			// data-1 = 2.5x Tari -> RTcal/Tari = 3.5
			expect(
				detector.processSymbols(buildCommand({ data1Factor: 2.5, bits: [0, 1] }))
			).toHaveLength(0);
		});

		it('rejects a TRcal/RTcal ratio above 3.3', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			// RTcal = 31.25us, so TRcal = 120us gives a ratio of 3.84
			expect(
				detector.processSymbols(buildCommand({ trcalUs: 120, bits: [0, 1] }))
			).toHaveLength(0);
		});

		it('stops collecting data at a symbol longer than 4x RTcal', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const results = detector.processSymbols(buildCommand({ bits: [1, 0, 1, 0, 1, 0] }));

			// The trailing CW period must not be counted as a seventh bit.
			expect(
				detector.classifySymbols(results[0].dataSymbols ?? [], results[0].pivotSamples)
			).toHaveLength(6);
		});
	});

	describe('streaming: multiple commands per call', () => {
		it('detects two frame-syncs in one stream', () => {
			const first = buildCommand({ bits: [1, 0, 1] });
			const second = buildCommand({ bits: [0, 1, 0], startOffset: spanOf(first) });

			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const results = detector.processSymbols(first.concat(second));

			expect(results).toHaveLength(2);
			expect(
				detector.classifySymbols(results[0].dataSymbols ?? [], results[0].pivotSamples)
			).toEqual([1, 0, 1]);
			expect(
				detector.classifySymbols(results[1].dataSymbols ?? [], results[1].pivotSamples)
			).toEqual([0, 1, 0]);
		});

		it('detects a preamble followed by a frame-sync', () => {
			const query = buildCommand({ trcalUs: TRCAL_US, bits: [1, 1, 0, 0] });
			const next = buildCommand({ bits: [0, 1], startOffset: spanOf(query) });

			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const results = detector.processSymbols(query.concat(next));

			expect(results).toHaveLength(2);
			expect(results[0].type).toBe('preamble');
			expect(results[1].type).toBe('frame-sync');
		});
	});

	describe('streaming: continuity across calls', () => {
		it('decodes a command split across two calls', () => {
			const bits = [1, 0, 0, 1, 1, 0];
			const command = buildCommand({ bits });
			const split = 4; // mid-preamble

			const detector = new FrameSyncDetector(SAMPLE_RATE);
			expect(detector.processSymbols(command.slice(0, split))).toHaveLength(0);

			const results = detector.processSymbols(command.slice(split));
			expect(results).toHaveLength(1);
			expect(
				detector.classifySymbols(results[0].dataSymbols ?? [], results[0].pivotSamples)
			).toEqual(bits);
		});

		it('decodes a command split mid-data rather than truncating it', () => {
			const bits = [1, 0, 1, 1, 0, 0, 1, 0];
			const command = buildCommand({ bits });
			const split = command.length - 4; // after the sync, inside the data bits

			const detector = new FrameSyncDetector(SAMPLE_RATE);
			// No truncated command may be emitted while the tail is still missing.
			expect(detector.processSymbols(command.slice(0, split))).toHaveLength(0);

			const results = detector.processSymbols(command.slice(split));
			expect(results).toHaveLength(1);
			expect(
				detector.classifySymbols(results[0].dataSymbols ?? [], results[0].pivotSamples)
			).toEqual(bits);
		});

		it('holds a partial sync at end of stream for the next call', () => {
			const command = buildCommand({ bits: [0, 1] });

			const detector = new FrameSyncDetector(SAMPLE_RATE);
			expect(detector.processSymbols(command.slice(0, 3))).toHaveLength(0);
			expect(detector.processSymbols(command.slice(3))).toHaveLength(1);
		});
	});

	describe('edge cases', () => {
		it('returns an empty array for an empty run stream', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			expect(detector.processSymbols([])).toEqual([]);
		});

		it('returns an empty array when the stream holds no delimiter', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const stream = runs(
				[
					['high', us(30)],
					['low', us(4)],
					['high', us(30)],
					['low', us(4)],
				],
				0
			);
			expect(detector.processSymbols(stream)).toEqual([]);
		});

		it('returns an empty array for a sync with too few runs to classify', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			// delimiter + data-0 + RTcal only: 5 runs, not enough to tell
			// preamble from frame-sync
			const partial = buildCommand({ bits: [], terminate: false }).slice(0, 5);
			expect(detector.processSymbols(partial)).toHaveLength(0);
		});
	});

	describe('getLastTariUs()', () => {
		it('returns 0 before any sync is detected', () => {
			expect(new FrameSyncDetector(SAMPLE_RATE).getLastTariUs()).toBe(0);
		});

		it('returns the detected Tari after a sync', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			detector.processSymbols(buildCommand({ tariUs: 12.5, bits: [0, 1] }));
			expect(detector.getLastTariUs()).toBeCloseTo(12.5, 5);
		});
	});

	describe('reset()', () => {
		it('clears residual runs so a stale tail cannot join a new capture', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const command = buildCommand({ bits: [1, 0] });

			detector.processSymbols(command.slice(0, 3));
			detector.reset();

			// Without the residual, the tail alone holds no delimiter.
			expect(detector.processSymbols(command.slice(3))).toHaveLength(0);
		});

		it('clears lastTariSamples', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			detector.processSymbols(buildCommand({ bits: [0, 1] }));
			expect(detector.getLastTariUs()).toBeGreaterThan(0);

			detector.reset();
			expect(detector.getLastTariUs()).toBe(0);
		});
	});

	describe('classifySymbols()', () => {
		it('returns no bits for an empty run list', () => {
			expect(new FrameSyncDetector(SAMPLE_RATE).classifySymbols([], PIVOT_SAMPLES)).toEqual([]);
		});

		it('ignores a trailing unpaired high run', () => {
			const detector = new FrameSyncDetector(SAMPLE_RATE);
			const stream = runs(
				[
					['high', TARI_SAMPLES - 9],
					['low', 9],
					['high', TARI_SAMPLES - 9], // no closing PW pulse
				],
				0
			);
			expect(detector.classifySymbols(stream, PIVOT_SAMPLES)).toEqual([0]);
		});
	});
});
