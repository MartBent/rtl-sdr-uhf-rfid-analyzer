import { describe, it, expect } from 'vitest';
import { decodeCommand, identifyCommand } from './gen2-decoder';
import { crc5, crc16 } from './gen2-crc';

/**
 * Helper: Convert a number to an array of bits (MSB first).
 */
function numberToBits(value: number, bitCount: number): number[] {
	const bits: number[] = [];
	for (let i = bitCount - 1; i >= 0; i--) {
		bits.push((value >> i) & 1);
	}
	return bits;
}

/**
 * Helper: Append CRC-5 bits to a data bit array.
 */
function appendCrc5(dataBits: number[]): number[] {
	const crcValue = crc5(dataBits);
	return [...dataBits, ...numberToBits(crcValue, 5)];
}

/**
 * Helper: Append CRC-16 bits to a data bit array.
 */
function appendCrc16(dataBits: number[]): number[] {
	const crcValue = crc16(dataBits);
	return [...dataBits, ...numberToBits(crcValue, 16)];
}

describe('gen2-decoder', () => {
	describe('identifyCommand', () => {
		it('identifies Query from prefix 1000', () => {
			expect(identifyCommand([1, 0, 0, 0, 0, 0, 0, 0])).toBe('Query');
		});

		it('identifies QueryRep from prefix 00', () => {
			expect(identifyCommand([0, 0, 0, 1])).toBe('QueryRep');
		});

		it('identifies QueryAdjust from prefix 1001', () => {
			expect(identifyCommand([1, 0, 0, 1, 0, 0, 0, 0, 0])).toBe('QueryAdjust');
		});

		it('identifies ACK from prefix 01', () => {
			expect(identifyCommand([0, 1, 0, 0, 0, 0])).toBe('ACK');
		});

		it('identifies NAK from prefix 11000000', () => {
			expect(identifyCommand([1, 1, 0, 0, 0, 0, 0, 0])).toBe('NAK');
		});

		it('identifies Select from prefix 1011', () => {
			expect(identifyCommand([1, 0, 1, 1, 0, 0, 0, 0])).toBe('Select');
		});

		it('identifies ReqRN from prefix 11000001', () => {
			expect(identifyCommand([1, 1, 0, 0, 0, 0, 0, 1])).toBe('ReqRN');
		});

		it('returns Unknown for insufficient bits', () => {
			expect(identifyCommand([])).toBe('Unknown');
			expect(identifyCommand([1])).toBe('Unknown');
		});

		it('returns Unknown for unrecognized prefix', () => {
			// 1010 is not a valid command prefix
			expect(identifyCommand([1, 0, 1, 0, 0, 0, 0, 0])).toBe('Unknown');
		});
	});

	describe('Query command', () => {
		// Query: 1000 + DR(1) + M(2) + TRext(1) + Sel(2) + Session(2) + Target(1) + Q(4) + CRC-5(5) = 22 bits
		it('decodes Query with DR=8, M=FM0, Session=S1, Target=A, Q=4', () => {
			const dataBits = [
				1, 0, 0, 0, // code
				0, // DR=0 -> '8'
				0, 0, // M=00 -> 'FM0'
				0, // TRext=0 -> false
				0, 0, // Sel=00 -> 'All'
				0, 1, // Session=01 -> 'S1'
				0, // Target=0 -> 'A'
				0, 1, 0, 0, // Q=4
			];
			const fullBits = appendCrc5(dataBits);
			expect(fullBits.length).toBe(22);

			const cmd = decodeCommand(fullBits);
			expect(cmd.type).toBe('Query');
			expect(cmd.crcValid).toBe(true);
			expect(cmd.rawBits).toEqual(fullBits);

			const params = cmd.params as { dr: string; m: string; trext: boolean; sel: string; session: string; target: string; q: number };
			expect(params.dr).toBe('8');
			expect(params.m).toBe('FM0');
			expect(params.trext).toBe(false);
			expect(params.sel).toBe('All');
			expect(params.session).toBe('S1');
			expect(params.target).toBe('A');
			expect(params.q).toBe(4);
		});

		it('decodes Query with DR=64/3, M=Miller8, Session=S3, Target=B, Q=15', () => {
			const dataBits = [
				1, 0, 0, 0, // code
				1, // DR=1 -> '64/3'
				1, 1, // M=11 -> 'Miller8'
				1, // TRext=1 -> true
				1, 1, // Sel=11 -> 'SL'
				1, 1, // Session=11 -> 'S3'
				1, // Target=1 -> 'B'
				1, 1, 1, 1, // Q=15
			];
			const fullBits = appendCrc5(dataBits);

			const cmd = decodeCommand(fullBits);
			expect(cmd.type).toBe('Query');
			expect(cmd.crcValid).toBe(true);

			const params = cmd.params as { dr: string; m: string; trext: boolean; sel: string; session: string; target: string; q: number };
			expect(params.dr).toBe('64/3');
			expect(params.m).toBe('Miller8');
			expect(params.trext).toBe(true);
			expect(params.sel).toBe('SL');
			expect(params.session).toBe('S3');
			expect(params.target).toBe('B');
			expect(params.q).toBe(15);
		});

		it('reports CRC failure on corrupted Query', () => {
			const dataBits = [
				1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0,
			];
			const fullBits = appendCrc5(dataBits);
			// Flip a bit
			const corrupted = [...fullBits];
			corrupted[5] ^= 1;

			const cmd = decodeCommand(corrupted);
			expect(cmd.type).toBe('Query');
			expect(cmd.crcValid).toBe(false);
		});
	});

	describe('QueryRep command', () => {
		// QueryRep: 00 + Session(2) = 4 bits
		it('decodes QueryRep with Session=S0', () => {
			const bits = [0, 0, 0, 0]; // code(00) + session(00=S0)
			const cmd = decodeCommand(bits);
			expect(cmd.type).toBe('QueryRep');
			expect(cmd.crcValid).toBeNull();
			expect(cmd.rawBits).toEqual(bits);

			const params = cmd.params as { session: string };
			expect(params.session).toBe('S0');
		});

		it('decodes QueryRep with Session=S2', () => {
			const bits = [0, 0, 1, 0]; // code(00) + session(10=S2)
			const cmd = decodeCommand(bits);
			expect(cmd.type).toBe('QueryRep');

			const params = cmd.params as { session: string };
			expect(params.session).toBe('S2');
		});
	});

	describe('QueryAdjust command', () => {
		// QueryAdjust: 1001 + Session(2) + UpDn(3) = 9 bits
		it('decodes QueryAdjust with Session=S1, upDn=none', () => {
			const bits = [1, 0, 0, 1, 0, 1, 0, 0, 0]; // code(1001) + session(01=S1) + upDn(000=none)
			const cmd = decodeCommand(bits);
			expect(cmd.type).toBe('QueryAdjust');
			expect(cmd.crcValid).toBeNull();
			expect(cmd.rawBits).toEqual(bits);

			const params = cmd.params as { session: string; upDn: string };
			expect(params.session).toBe('S1');
			expect(params.upDn).toBe('none');
		});

		it('decodes QueryAdjust with upDn=up', () => {
			const bits = [1, 0, 0, 1, 0, 1, 1, 1, 0]; // code(1001) + session(01=S1) + upDn(110=up)
			const cmd = decodeCommand(bits);
			expect(cmd.type).toBe('QueryAdjust');

			const params = cmd.params as { upDn: string };
			expect(params.upDn).toBe('up');
		});

		it('decodes QueryAdjust with upDn=down', () => {
			const bits = [1, 0, 0, 1, 1, 1, 0, 1, 1]; // code(1001) + session(11=S3) + upDn(011=down)
			const cmd = decodeCommand(bits);
			expect(cmd.type).toBe('QueryAdjust');

			const params = cmd.params as { session: string; upDn: string };
			expect(params.session).toBe('S3');
			expect(params.upDn).toBe('down');
		});
	});

	describe('ACK command', () => {
		// ACK: 01 + RN16(16) = 18 bits
		it('decodes ACK with RN16=0xABCD', () => {
			const rn16 = 0xabcd;
			const bits = [0, 1, ...numberToBits(rn16, 16)]; // code(01) + RN16
			expect(bits.length).toBe(18);

			const cmd = decodeCommand(bits);
			expect(cmd.type).toBe('ACK');
			expect(cmd.crcValid).toBeNull();
			expect(cmd.rawBits).toEqual(bits);

			const params = cmd.params as { rn16: number };
			expect(params.rn16).toBe(0xabcd);
		});

		it('decodes ACK with RN16=0x0000', () => {
			const bits = [0, 1, ...numberToBits(0, 16)];
			const cmd = decodeCommand(bits);

			const params = cmd.params as { rn16: number };
			expect(params.rn16).toBe(0);
		});

		it('decodes ACK with RN16=0xFFFF', () => {
			const bits = [0, 1, ...numberToBits(0xffff, 16)];
			const cmd = decodeCommand(bits);

			const params = cmd.params as { rn16: number };
			expect(params.rn16).toBe(0xffff);
		});
	});

	describe('NAK command', () => {
		// NAK: 11000000 = 8 bits
		it('decodes NAK', () => {
			const bits = [1, 1, 0, 0, 0, 0, 0, 0];
			const cmd = decodeCommand(bits);
			expect(cmd.type).toBe('NAK');
			expect(cmd.crcValid).toBeNull();
			expect(cmd.rawBits).toEqual(bits);
			expect(cmd.params).toEqual({});
		});
	});

	describe('Select command', () => {
		// Select: 1011 + Target(3) + Action(3) + MemBank(2) + Pointer(EBV) + Length(8) + Mask(variable) + Truncate(1) + CRC-16(16)
		it('decodes Select with mask length 0', () => {
			const dataBits = [
				1, 0, 1, 1, // code
				1, 0, 0, // target = 4
				0, 0, 0, // action = 0
				0, 1, // memBank = 1
				0, 0, 0, 0, 0, 0, 0, 0, // pointer EBV (MSB=0, 7 value bits=0000000, value=0)
				0, 0, 0, 0, 0, 0, 0, 0, // length = 0
				// no mask bits
				0, // truncate = false
			];
			const fullBits = appendCrc16(dataBits);

			const cmd = decodeCommand(fullBits);
			expect(cmd.type).toBe('Select');
			expect(cmd.crcValid).toBe(true);
			expect(cmd.rawBits).toEqual(fullBits);

			const params = cmd.params as { target: number; action: number; memBank: number; pointer: number; length: number; mask: number[]; truncate: boolean };
			expect(params.target).toBe(4);
			expect(params.action).toBe(0);
			expect(params.memBank).toBe(1);
			expect(params.pointer).toBe(0);
			expect(params.length).toBe(0);
			expect(params.mask).toEqual([]);
			expect(params.truncate).toBe(false);
		});

		it('decodes Select with mask length 16', () => {
			const maskBits = [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 0]; // 0xAACC
			const dataBits = [
				1, 0, 1, 1, // code
				0, 1, 0, // target = 2
				1, 0, 1, // action = 5
				1, 0, // memBank = 2
				0, 0, 1, 0, 0, 0, 0, 0, // pointer EBV (MSB=0, 7 value bits=0100000, value=32)
				0, 0, 0, 1, 0, 0, 0, 0, // length = 16
				...maskBits,
				1, // truncate = true
			];
			const fullBits = appendCrc16(dataBits);

			const cmd = decodeCommand(fullBits);
			expect(cmd.type).toBe('Select');
			expect(cmd.crcValid).toBe(true);

			const params = cmd.params as { target: number; action: number; memBank: number; pointer: number; length: number; mask: number[]; truncate: boolean };
			expect(params.target).toBe(2);
			expect(params.action).toBe(5);
			expect(params.memBank).toBe(2);
			expect(params.pointer).toBe(32);
			expect(params.length).toBe(16);
			expect(params.mask).toEqual(maskBits);
			expect(params.truncate).toBe(true);
		});

		it('decodes Select with mask length 32', () => {
			const maskBits = new Array(32).fill(0).map((_, i) => i % 2); // alternating 0/1
			const dataBits = [
				1, 0, 1, 1, // code
				0, 0, 0, // target = 0
				0, 0, 0, // action = 0
				0, 0, // memBank = 0
				0, 0, 0, 0, 0, 0, 0, 0, // pointer EBV (MSB=0, value=0)
				0, 0, 1, 0, 0, 0, 0, 0, // length = 32
				...maskBits,
				0, // truncate = false
			];
			const fullBits = appendCrc16(dataBits);

			const cmd = decodeCommand(fullBits);
			expect(cmd.type).toBe('Select');
			expect(cmd.crcValid).toBe(true);

			const params = cmd.params as { length: number; mask: number[] };
			expect(params.length).toBe(32);
			expect(params.mask.length).toBe(32);
			expect(params.mask).toEqual(maskBits);
		});

		it('reports CRC failure on corrupted Select', () => {
			const dataBits = [
				1, 0, 1, 1, // code
				0, 0, 0, // target
				0, 0, 0, // action
				0, 1, // memBank
				0, 0, 0, 0, 0, 0, 0, 0, // pointer EBV (8 bits)
				0, 0, 0, 0, 0, 0, 0, 0, // length = 0
				0, // truncate
			];
			const fullBits = appendCrc16(dataBits);
			const corrupted = [...fullBits];
			corrupted[8] ^= 1;

			const cmd = decodeCommand(corrupted);
			expect(cmd.type).toBe('Select');
			expect(cmd.crcValid).toBe(false);
		});

		it('handles Select with multi-byte EBV pointer', () => {
			// EBV with 2 octets: first octet MSB=1 (more), second octet MSB=0 (last)
			// 1_0000001 0_0000010 = value (0x01 << 7) | 0x02 = 130
			// Each octet is 8 bits: 1 continuation + 7 value
			const dataBits = [
				1, 0, 1, 1, // code
				0, 0, 0, // target = 0
				0, 0, 0, // action = 0
				0, 0, // memBank = 0
				1, 0, 0, 0, 0, 0, 0, 1, // EBV octet 1 (MSB=1, 7 value bits=0000001, value=1)
				0, 0, 0, 0, 0, 0, 1, 0, // EBV octet 2 (MSB=0, 7 value bits=0000010, value=2)
				0, 0, 0, 0, 0, 0, 0, 0, // length = 0
				0, // truncate = false
			];
			const fullBits = appendCrc16(dataBits);

			const cmd = decodeCommand(fullBits);
			expect(cmd.type).toBe('Select');
			expect(cmd.crcValid).toBe(true);

			const params = cmd.params as { pointer: number };
			// EBV decoding: (0b0000001 << 7) | 0b0000010 = 128 + 2 = 130
			expect(params.pointer).toBe(130);
		});
	});

	describe('ReqRN command', () => {
		// ReqRN: 11000001 + RN16(16) + CRC-16(16) = 40 bits
		it('decodes ReqRN with valid CRC', () => {
			const rn16 = 0xabcd;
			const dataBits = [
				1, 1, 0, 0, 0, 0, 0, 1, // code
				...numberToBits(rn16, 16), // RN16
			];
			const fullBits = appendCrc16(dataBits);
			expect(fullBits.length).toBe(40);

			const cmd = decodeCommand(fullBits);
			expect(cmd.type).toBe('ReqRN');
			expect(cmd.crcValid).toBe(true);
			expect(cmd.rawBits).toEqual(fullBits);

			const params = cmd.params as { rn16: number };
			expect(params.rn16).toBe(0xabcd);
		});

		it('reports CRC failure on corrupted ReqRN', () => {
			const dataBits = [
				1, 1, 0, 0, 0, 0, 0, 1,
				...numberToBits(0x1234, 16),
			];
			const fullBits = appendCrc16(dataBits);
			const corrupted = [...fullBits];
			corrupted[12] ^= 1;

			const cmd = decodeCommand(corrupted);
			expect(cmd.type).toBe('ReqRN');
			expect(cmd.crcValid).toBe(false);
		});
	});

	describe('Unknown command', () => {
		it('decodes unknown bit patterns as Unknown', () => {
			// 1010 is not a valid command prefix
			const bits = [1, 0, 1, 0, 0, 0, 0, 0];
			const cmd = decodeCommand(bits);
			expect(cmd.type).toBe('Unknown');
			expect(cmd.rawBits).toEqual(bits);
		});

		it('decodes empty bits as Unknown', () => {
			const cmd = decodeCommand([]);
			expect(cmd.type).toBe('Unknown');
		});
	});

	describe('rawBits preservation (DEC-10)', () => {
		it('preserves rawBits on every command type', () => {
			// Query
			const queryData = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0];
			const queryBits = appendCrc5(queryData);
			expect(decodeCommand(queryBits).rawBits).toEqual(queryBits);

			// QueryRep
			const qrepBits = [0, 0, 1, 0];
			expect(decodeCommand(qrepBits).rawBits).toEqual(qrepBits);

			// QueryAdjust
			const qadjBits = [1, 0, 0, 1, 0, 1, 0, 0, 0];
			expect(decodeCommand(qadjBits).rawBits).toEqual(qadjBits);

			// ACK
			const ackBits = [0, 1, ...numberToBits(0x5678, 16)];
			expect(decodeCommand(ackBits).rawBits).toEqual(ackBits);

			// NAK
			const nakBits = [1, 1, 0, 0, 0, 0, 0, 0];
			expect(decodeCommand(nakBits).rawBits).toEqual(nakBits);

			// Select (code(4) + target(3) + action(3) + memBank(2) + pointer_EBV(8) + length(8) + truncate(1) = 29 bits)
			const selectData = [1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
			const selectBits = appendCrc16(selectData);
			expect(decodeCommand(selectBits).rawBits).toEqual(selectBits);

			// ReqRN
			const reqrnData = [1, 1, 0, 0, 0, 0, 0, 1, ...numberToBits(0x1111, 16)];
			const reqrnBits = appendCrc16(reqrnData);
			expect(decodeCommand(reqrnBits).rawBits).toEqual(reqrnBits);
		});
	});

	describe('sampleOffset and timestamp', () => {
		it('sets sampleOffset and timestamp from parameters', () => {
			const bits = [0, 0, 0, 0]; // QueryRep
			const cmd = decodeCommand(bits, 48000, 2400000);
			expect(cmd.sampleOffset).toBe(48000);
			expect(cmd.timestamp).toBeCloseTo(20, 1); // 48000 / 2400000 * 1000 = 20ms
		});

		it('defaults sampleOffset to 0 and timestamp to 0', () => {
			const bits = [0, 0, 0, 0]; // QueryRep
			const cmd = decodeCommand(bits);
			expect(cmd.sampleOffset).toBe(0);
			expect(cmd.timestamp).toBe(0);
		});
	});
});
