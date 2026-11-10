/**
 * EPC Gen2 Command Decoder
 *
 * Parses bit streams into structured Gen2 commands with typed parameters.
 * Supports all 7 reader command types: Query, QueryRep, QueryAdjust, ACK, NAK, Select, ReqRN.
 *
 * Command identification uses prefix matching with longer codes checked first
 * to avoid ambiguity between 2-bit, 4-bit, and 8-bit command codes.
 */

import type {
	Gen2Command,
	Gen2CommandType,
	QueryParams,
	QueryRepParams,
	QueryAdjustParams,
	AckParams,
	NakParams,
	SelectParams,
	ReqRnParams,
} from './gen2-types';
import { validateCrc5, validateCrc16 } from './gen2-crc';

// --- Lookup tables for parameter decoding ---

const DR_MAP: Record<number, '8' | '64/3'> = { 0: '8', 1: '64/3' };

const M_MAP: Record<number, 'FM0' | 'Miller2' | 'Miller4' | 'Miller8'> = {
	0: 'FM0',
	1: 'Miller2',
	2: 'Miller4',
	3: 'Miller8',
};

const SEL_MAP: Record<number, 'All' | '~SL' | 'SL'> = {
	0: 'All',
	1: 'All',
	2: '~SL',
	3: 'SL',
};

const SESSION_MAP: Record<number, 'S0' | 'S1' | 'S2' | 'S3'> = {
	0: 'S0',
	1: 'S1',
	2: 'S2',
	3: 'S3',
};

// UpDn encoding per Gen2 spec table 6.18
const UPDN_MAP: Record<number, 'up' | 'none' | 'down'> = {
	0b110: 'up',
	0b000: 'none',
	0b011: 'down',
};

// --- Helper functions ---

/**
 * Convert a slice of bits to an unsigned integer.
 */
function bitsToNumber(bits: number[], start: number, length: number): number {
	let value = 0;
	for (let i = 0; i < length; i++) {
		value = (value << 1) | (bits[start + i] ?? 0);
	}
	return value;
}

/**
 * Decode an Extensible Bit Vector (EBV) starting at the given index.
 * EBV: 8-bit chunks (octets) where MSB=1 means more chunks follow, MSB=0 is last chunk.
 * Lower 7 bits of each octet carry the value (big-endian).
 * Returns the decoded value and number of bits consumed.
 */
function decodeEBV(bits: number[], startIndex: number): { value: number; bitsConsumed: number } {
	let value = 0;
	let idx = startIndex;

	while (idx < bits.length) {
		const msb = bits[idx]; // continuation bit
		const chunk = bitsToNumber(bits, idx + 1, 7); // 7 value bits per octet
		value = (value << 7) | chunk;
		idx += 8; // 8 bits per EBV octet

		if (msb === 0) {
			// Last chunk
			break;
		}
	}

	return { value, bitsConsumed: idx - startIndex };
}

/**
 * Check if bits match a specific prefix pattern.
 */
function matchPrefix(bits: number[], prefix: number[]): boolean {
	if (bits.length < prefix.length) return false;
	for (let i = 0; i < prefix.length; i++) {
		if (bits[i] !== prefix[i]) return false;
	}
	return true;
}

// --- Bit count validation ---

/** Expected bit counts per command type. Tuple = [min, max] for variable-length. */
const EXPECTED_BIT_COUNTS: Record<Gen2CommandType, number | [number, number]> = {
	Query: 22,
	QueryRep: 4,
	QueryAdjust: 9,
	ACK: 18,
	NAK: 8,
	ReqRN: 40,
	Select: [29, 500], // variable: min 29 (code+fields+CRC16, mask=0), max reasonable
	Unknown: [0, Infinity],
};

/**
 * Check if a bit count is valid for the given command type.
 */
function validateBitCount(type: Gen2CommandType, bitCount: number): boolean {
	const expected = EXPECTED_BIT_COUNTS[type];
	if (Array.isArray(expected)) {
		return bitCount >= expected[0] && bitCount <= expected[1];
	}
	return bitCount === expected;
}

// --- Command identification ---

/**
 * Identify the Gen2 command type from its bit prefix.
 * Checks longer codes first to avoid ambiguity.
 */
export function identifyCommand(bits: number[]): Gen2CommandType {
	if (bits.length < 2) return 'Unknown';

	// 8-bit codes (check first -- longest prefix)
	if (bits.length >= 8) {
		if (matchPrefix(bits, [1, 1, 0, 0, 0, 0, 0, 0])) return 'NAK';
		if (matchPrefix(bits, [1, 1, 0, 0, 0, 0, 0, 1])) return 'ReqRN';
	}

	// 4-bit codes
	if (bits.length >= 4) {
		if (matchPrefix(bits, [1, 0, 0, 0])) return 'Query';
		if (matchPrefix(bits, [1, 0, 0, 1])) return 'QueryAdjust';
		if (matchPrefix(bits, [1, 0, 1, 1])) return 'Select';
	}

	// 2-bit codes
	if (matchPrefix(bits, [0, 0])) return 'QueryRep';
	if (matchPrefix(bits, [0, 1])) return 'ACK';

	return 'Unknown';
}

// --- Command parsers ---

function decodeQuery(bits: number[]): Gen2Command {
	// Query: code(4) + DR(1) + M(2) + TRext(1) + Sel(2) + Session(2) + Target(1) + Q(4) + CRC-5(5) = 22 bits
	const dr = DR_MAP[bits[4]] ?? '8';
	const m = M_MAP[bitsToNumber(bits, 5, 2)] ?? 'FM0';
	const trext = bits[7] === 1;
	const sel = SEL_MAP[bitsToNumber(bits, 8, 2)] ?? 'All';
	const session = SESSION_MAP[bitsToNumber(bits, 10, 2)] ?? 'S0';
	const target = bits[12] === 1 ? 'B' : 'A';
	const q = bitsToNumber(bits, 13, 4);
	const crcValid = validateCrc5(bits);

	const params: QueryParams = { dr, m, trext, sel, session, target, q };
	return makeCommand('Query', bits, params, crcValid);
}

function decodeQueryRep(bits: number[]): Gen2Command {
	// QueryRep: code(2) + Session(2) = 4 bits
	const session = SESSION_MAP[bitsToNumber(bits, 2, 2)] ?? 'S0';
	const params: QueryRepParams = { session };
	return makeCommand('QueryRep', bits, params, null);
}

function decodeQueryAdjust(bits: number[]): Gen2Command {
	// QueryAdjust: code(4) + Session(2) + UpDn(3) = 9 bits
	const session = SESSION_MAP[bitsToNumber(bits, 4, 2)] ?? 'S0';
	const upDnValue = bitsToNumber(bits, 6, 3);
	const upDn = UPDN_MAP[upDnValue] ?? 'none';
	const params: QueryAdjustParams = { session, upDn };
	return makeCommand('QueryAdjust', bits, params, null);
}

function decodeAck(bits: number[]): Gen2Command {
	// ACK: code(2) + RN16(16) = 18 bits
	const rn16 = bitsToNumber(bits, 2, 16);
	const params: AckParams = { rn16 };
	return makeCommand('ACK', bits, params, null);
}

function decodeNak(bits: number[]): Gen2Command {
	// NAK: code(8) = 8 bits, no params
	const params: NakParams = {};
	return makeCommand('NAK', bits, params, null);
}

function decodeSelect(bits: number[]): Gen2Command {
	// Select: code(4) + Target(3) + Action(3) + MemBank(2) + Pointer(EBV) + Length(8) + Mask(variable) + Truncate(1) + CRC-16(16)
	const target = bitsToNumber(bits, 4, 3);
	const action = bitsToNumber(bits, 7, 3);
	const memBank = bitsToNumber(bits, 10, 2);

	// Decode EBV pointer starting at bit 12
	const { value: pointer, bitsConsumed: ebvBits } = decodeEBV(bits, 12);
	const lengthStart = 12 + ebvBits;
	const length = bitsToNumber(bits, lengthStart, 8);

	const maskStart = lengthStart + 8;
	const mask: number[] = [];
	for (let i = 0; i < length; i++) {
		mask.push(bits[maskStart + i] ?? 0);
	}

	const truncateIdx = maskStart + length;
	const truncate = (bits[truncateIdx] ?? 0) === 1;

	// CRC-16 validated over all bits
	const crcValid = validateCrc16(bits);

	const params: SelectParams = { target, action, memBank, pointer, length, mask, truncate };
	return makeCommand('Select', bits, params, crcValid);
}

function decodeReqRn(bits: number[]): Gen2Command {
	// ReqRN: code(8) + RN16(16) + CRC-16(16) = 40 bits
	const rn16 = bitsToNumber(bits, 8, 16);
	const crcValid = validateCrc16(bits);
	const params: ReqRnParams = { rn16 };
	return makeCommand('ReqRN', bits, params, crcValid);
}

function decodeUnknown(bits: number[]): Gen2Command {
	return makeCommand('Unknown', bits, {}, null);
}

// --- Factory ---

function makeCommand(
	type: Gen2CommandType,
	rawBits: number[],
	params: Gen2Command['params'],
	crcValid: boolean | null,
	sampleOffset: number = 0,
	timestamp: number = 0
): Gen2Command {
	return {
		type,
		rawBits: [...rawBits], // defensive copy
		sampleOffset,
		timestamp,
		crcValid,
		params,
		roundId: 0, // assigned by inventory tracker later
	};
}

// --- Main decoder ---

/**
 * Decode a bit array into a structured Gen2 command.
 *
 * @param bits - Array of 0/1 values representing the command
 * @param sampleOffset - Optional position in IQ stream for timing
 * @param sampleRate - Optional sample rate for timestamp calculation
 * @returns Decoded Gen2Command with typed parameters
 */
export function decodeCommand(
	bits: number[],
	sampleOffset: number = 0,
	sampleRate: number = 0
): Gen2Command {
	const type = identifyCommand(bits);
	const timestamp = sampleRate > 0 ? (sampleOffset / sampleRate) * 1000 : 0;

	// Reject if bit count doesn't match expected length for identified type
	if (type !== 'Unknown' && !validateBitCount(type, bits.length)) {
		const cmd = decodeUnknown(bits);
		cmd.sampleOffset = sampleOffset;
		cmd.timestamp = timestamp;
		return cmd;
	}

	let cmd: Gen2Command;

	switch (type) {
		case 'Query':
			cmd = decodeQuery(bits);
			break;
		case 'QueryRep':
			cmd = decodeQueryRep(bits);
			break;
		case 'QueryAdjust':
			cmd = decodeQueryAdjust(bits);
			break;
		case 'ACK':
			cmd = decodeAck(bits);
			break;
		case 'NAK':
			cmd = decodeNak(bits);
			break;
		case 'Select':
			cmd = decodeSelect(bits);
			break;
		case 'ReqRN':
			cmd = decodeReqRn(bits);
			break;
		default:
			cmd = decodeUnknown(bits);
			break;
	}

	cmd.sampleOffset = sampleOffset;
	cmd.timestamp = timestamp;

	return cmd;
}
