import { describe, it, expect } from 'vitest';
import { crc5, validateCrc5, crc16, validateCrc16 } from './gen2-crc';

describe('gen2-crc', () => {
	describe('CRC-5 (Query command)', () => {
		// CRC-5: polynomial 0x09, preset 0x09, residue 0x00
		// Query command is 22 bits: 4-bit code + 13-bit payload + 5-bit CRC
		// Test vector: Query with DR=0('8'), M=00('FM0'), TRext=0, Sel=00('All'),
		// Session=01('S1'), Target=0('A'), Q=0100(4)
		// Data bits (17): 1000 0 00 0 00 01 0 0100
		const queryDataBits = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0];

		it('computes CRC-5 for known Query data bits', () => {
			const crcValue = crc5(queryDataBits);
			// CRC-5 should produce a 5-bit value (0-31)
			expect(crcValue).toBeGreaterThanOrEqual(0);
			expect(crcValue).toBeLessThanOrEqual(31);
		});

		it('validates CRC-5 when correct CRC is appended', () => {
			const crcValue = crc5(queryDataBits);
			// Convert CRC to 5 bits and append
			const crcBits = [];
			for (let i = 4; i >= 0; i--) {
				crcBits.push((crcValue >> i) & 1);
			}
			const fullCommand = [...queryDataBits, ...crcBits];
			expect(fullCommand.length).toBe(22); // 17 data + 5 CRC
			expect(validateCrc5(fullCommand)).toBe(true);
		});

		it('rejects CRC-5 when a bit is flipped', () => {
			const crcValue = crc5(queryDataBits);
			const crcBits = [];
			for (let i = 4; i >= 0; i--) {
				crcBits.push((crcValue >> i) & 1);
			}
			const fullCommand = [...queryDataBits, ...crcBits];
			// Flip bit 5 (corrupt the data)
			const corrupted = [...fullCommand];
			corrupted[5] = corrupted[5] ^ 1;
			expect(validateCrc5(corrupted)).toBe(false);
		});

		it('validates a second Query test vector', () => {
			// Query: DR=1('64/3'), M=11('Miller8'), TRext=1, Sel=11('SL'),
			// Session=11('S3'), Target=1('B'), Q=1111(15)
			// Data bits (17): 1000 1 11 1 11 11 1 1111
			const queryData2 = [1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
			const crcValue = crc5(queryData2);
			const crcBits = [];
			for (let i = 4; i >= 0; i--) {
				crcBits.push((crcValue >> i) & 1);
			}
			const fullCommand = [...queryData2, ...crcBits];
			expect(validateCrc5(fullCommand)).toBe(true);
		});
	});

	describe('CRC-16/GENIBUS (Select, ReqRN)', () => {
		// CRC-16: polynomial 0x1021, preset 0xFFFF, XOR-out 0xFFFF, residue 0x1D0F

		it('computes CRC-16 for known data bits', () => {
			// ReqRN command: 8-bit code + 16-bit RN16 = 24 data bits
			// Code: 11000001, RN16: 0xABCD = 1010101111001101
			const reqRnData = [
				1, 1, 0, 0, 0, 0, 0, 1, // code
				1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, // RN16 = 0xABCD
			];
			const crcValue = crc16(reqRnData);
			// CRC-16 should produce a 16-bit value
			expect(crcValue).toBeGreaterThanOrEqual(0);
			expect(crcValue).toBeLessThanOrEqual(0xffff);
		});

		it('validates CRC-16 when correct CRC is appended', () => {
			const reqRnData = [
				1, 1, 0, 0, 0, 0, 0, 1, // code
				1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, // RN16 = 0xABCD
			];
			const crcValue = crc16(reqRnData);
			// Convert CRC-16 to 16 bits and append
			const crcBits = [];
			for (let i = 15; i >= 0; i--) {
				crcBits.push((crcValue >> i) & 1);
			}
			const fullCommand = [...reqRnData, ...crcBits];
			expect(fullCommand.length).toBe(40); // 24 data + 16 CRC
			expect(validateCrc16(fullCommand)).toBe(true);
		});

		it('rejects CRC-16 when a bit is flipped', () => {
			const reqRnData = [
				1, 1, 0, 0, 0, 0, 0, 1,
				1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1,
			];
			const crcValue = crc16(reqRnData);
			const crcBits = [];
			for (let i = 15; i >= 0; i--) {
				crcBits.push((crcValue >> i) & 1);
			}
			const fullCommand = [...reqRnData, ...crcBits];
			// Flip bit 10 (corrupt data)
			const corrupted = [...fullCommand];
			corrupted[10] = corrupted[10] ^ 1;
			expect(validateCrc16(corrupted)).toBe(false);
		});

		it('works with non-byte-aligned input lengths', () => {
			// 13 bits of data (not byte-aligned)
			const oddLengthData = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0];
			const crcValue = crc16(oddLengthData);
			const crcBits = [];
			for (let i = 15; i >= 0; i--) {
				crcBits.push((crcValue >> i) & 1);
			}
			const fullMessage = [...oddLengthData, ...crcBits];
			expect(fullMessage.length).toBe(29); // 13 + 16
			expect(validateCrc16(fullMessage)).toBe(true);
		});

		it('validates a Select command test vector', () => {
			// Select: code(4) + Target(3) + Action(3) + MemBank(2) + Pointer(EBV: 1 byte) +
			// Length(8) + Mask(0 bits) + Truncate(1) = 28 data bits + 16 CRC
			// Code: 1011, Target: 100(4), Action: 000(0), MemBank: 01(1),
			// Pointer: 0_0000000 (EBV single byte, value 0), Length: 00000000(0),
			// Truncate: 0
			const selectData = [
				1, 0, 1, 1, // code
				1, 0, 0, // target = 4
				0, 0, 0, // action = 0
				0, 1, // memBank = 1
				0, 0, 0, 0, 0, 0, 0, // pointer EBV (MSB=0, value=0)
				0, 0, 0, 0, 0, 0, 0, 0, // length = 0
				// no mask bits (length = 0)
				0, // truncate = false
			];
			const crcValue = crc16(selectData);
			const crcBits = [];
			for (let i = 15; i >= 0; i--) {
				crcBits.push((crcValue >> i) & 1);
			}
			const fullCommand = [...selectData, ...crcBits];
			expect(validateCrc16(fullCommand)).toBe(true);
		});

		it('rejects CRC-16 with all-zero input flipped to single error', () => {
			// All zeros data
			const zeroData = [0, 0, 0, 0, 0, 0, 0, 0];
			const crcValue = crc16(zeroData);
			const crcBits = [];
			for (let i = 15; i >= 0; i--) {
				crcBits.push((crcValue >> i) & 1);
			}
			const fullMessage = [...zeroData, ...crcBits];
			expect(validateCrc16(fullMessage)).toBe(true);

			// Flip last data bit
			const corrupted = [...fullMessage];
			corrupted[7] = corrupted[7] ^ 1;
			expect(validateCrc16(corrupted)).toBe(false);
		});
	});
});
