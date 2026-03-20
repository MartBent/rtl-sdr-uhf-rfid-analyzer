/**
 * EPC Gen2 CRC Validation
 *
 * CRC-5:  polynomial x^5 + x^3 + 1 (0x09), preset 0x09, residue 0x00
 *         Used for: Query command (22 bits total, last 5 are CRC)
 *
 * CRC-16: polynomial x^16 + x^12 + x^5 + 1 (0x1021), preset 0xFFFF, XOR-out 0xFFFF
 *         This is CRC-16/GENIBUS. Residue 0x1D0F (raw register) when CRC appended and correct.
 *         Used for: Select, ReqRN, and tag responses
 *
 * Both operate bit-by-bit because Gen2 commands are NOT byte-aligned.
 * Algorithm: XOR each input bit into the MSB of the CRC register, then shift left.
 * This is equivalent to the standard byte-level CRC but operates on individual bits.
 */

/**
 * Compute CRC-5 over a bit array.
 * @param bits - Array of 0/1 values (data bits, no CRC)
 * @returns 5-bit CRC value (0-31)
 */
export function crc5(bits: number[]): number {
	let crc = 0x09; // preset
	for (const bit of bits) {
		// XOR input bit into MSB position
		crc ^= bit << 4;
		if (crc & 0x10) {
			crc = ((crc << 1) ^ 0x09) & 0x1f;
		} else {
			crc = (crc << 1) & 0x1f;
		}
	}
	return crc;
}

/**
 * Validate CRC-5 by computing over data+crc; residue should be 0x00.
 * @param bitsWithCrc - Array of 0/1 values including appended CRC-5 bits
 * @returns true if CRC is valid
 */
export function validateCrc5(bitsWithCrc: number[]): boolean {
	return crc5(bitsWithCrc) === 0x00;
}

/**
 * Compute CRC-16/GENIBUS over a bit array.
 * @param bits - Array of 0/1 values (data bits, no CRC)
 * @returns 16-bit CRC value (with XOR-out applied)
 */
export function crc16(bits: number[]): number {
	let crc = 0xffff; // preset
	for (const bit of bits) {
		// XOR input bit into MSB position
		crc ^= bit << 15;
		if (crc & 0x8000) {
			crc = ((crc << 1) ^ 0x1021) & 0xffff;
		} else {
			crc = (crc << 1) & 0xffff;
		}
	}
	return crc ^ 0xffff; // XOR-out
}

/**
 * Validate CRC-16 by computing CRC over data+crc.
 * For CRC-16/GENIBUS, the raw register residue is 0x1D0F when the codeword is valid.
 * Since crc16() applies XOR-out (^0xFFFF), we check against 0x1D0F ^ 0xFFFF = 0xE2F0.
 * @param bitsWithCrc - Array of 0/1 values including appended CRC-16 bits
 * @returns true if CRC is valid
 */
export function validateCrc16(bitsWithCrc: number[]): boolean {
	// Raw register residue for CRC-16/GENIBUS is 0x1D0F
	// crc16() returns raw ^ 0xFFFF, so check against 0x1D0F ^ 0xFFFF = 0xE2F0
	return crc16(bitsWithCrc) === 0xe2f0;
}
