/**
 * EPC Gen2 UHF RFID Protocol Type Definitions
 *
 * Shared types for the protocol decoding pipeline:
 * WASM demod -> frame sync -> command parser -> inventory tracker
 */

// Command type discriminant
export type Gen2CommandType =
	| 'Query'
	| 'QueryRep'
	| 'QueryAdjust'
	| 'ACK'
	| 'NAK'
	| 'Select'
	| 'ReqRN'
	| 'Unknown';

// Decoded command (output of command parser)
export interface Gen2Command {
	type: Gen2CommandType;
	rawBits: number[]; // original bits for display (DEC-10)
	sampleOffset: number; // position in IQ stream for timing
	timestamp: number; // ms since capture start (derived from sampleOffset / sampleRate)
	crcValid: boolean | null; // null for commands without CRC (QueryRep, QueryAdjust, ACK, NAK)
	params:
		| QueryParams
		| QueryRepParams
		| QueryAdjustParams
		| AckParams
		| NakParams
		| SelectParams
		| ReqRnParams
		| Record<string, never>;
	roundId: number; // inventory round number (assigned by inventory tracker)
}

export interface QueryParams {
	dr: '8' | '64/3';
	m: 'FM0' | 'Miller2' | 'Miller4' | 'Miller8';
	trext: boolean;
	sel: 'All' | '~SL' | 'SL';
	session: 'S0' | 'S1' | 'S2' | 'S3';
	target: 'A' | 'B';
	q: number; // 0-15
}

export interface QueryRepParams {
	session: 'S0' | 'S1' | 'S2' | 'S3';
}

export interface QueryAdjustParams {
	session: 'S0' | 'S1' | 'S2' | 'S3';
	upDn: 'up' | 'none' | 'down';
}

export interface AckParams {
	rn16: number; // 16-bit value
}

export interface NakParams {} // no params

export interface SelectParams {
	target: number; // 3 bits (0-7)
	action: number; // 3 bits (0-7)
	memBank: number; // 2 bits (0-3)
	pointer: number; // EBV decoded
	length: number; // 8 bits -- mask bit count
	mask: number[]; // variable-length bit array
	truncate: boolean;
}

export interface ReqRnParams {
	rn16: number; // 16-bit value
}

// Demodulator symbol (output of WASM demod, input to frame sync)
export interface DemodSymbol {
	type: 'pulse-high' | 'pulse-low';
	sampleOffset: number;
	durationSamples: number;
	amplitude: number;
}

// Frame sync result
export interface FrameSyncResult {
	type: 'preamble' | 'frame-sync';
	tariSamples: number; // Tari in samples (data-0 duration)
	pivotSamples: number; // RTcal/2 in samples (classification threshold)
	blf?: number; // Backscatter Link Frequency (only in preamble, from TRcal)
	sampleOffset: number; // where the sync was detected
	dataStartIndex: number; // index into symbol array where data bits begin
}

// Backscatter decode result (experimental)
export interface BackscatterResult {
	bits: number[];
	confidence: number; // 0-1
	encoding: 'FM0' | 'Miller2' | 'Miller4' | 'Miller8';
	sampleOffset: number;
}

// Decoded commands message sent from DSP Worker to main thread
export interface DecodedCommandMsg {
	type: Gen2CommandType;
	rawBits: number[];
	sampleOffset: number;
	timestamp: number;
	crcValid: boolean | null;
	params: Gen2Command['params'];
}

// Round update message
export interface RoundUpdate {
	roundId: number;
	complete: boolean;
	commandCount: number;
}
