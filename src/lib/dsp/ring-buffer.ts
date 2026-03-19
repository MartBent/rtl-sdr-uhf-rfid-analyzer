import { RingBuffer } from 'ringbuf.js';

/**
 * Create a SharedArrayBuffer-backed ring buffer for IQ sample transfer
 * between the USB Worker (producer) and DSP Worker (consumer).
 *
 * @param capacityBytes Number of bytes the ring buffer can hold.
 * @returns The SharedArrayBuffer and a writer (push) handle.
 */
export function createRingBuffer(capacityBytes: number): {
	sab: SharedArrayBuffer;
	writer: RingBuffer;
} {
	const sab = RingBuffer.getStorageForCapacity(capacityBytes, Uint8Array);
	const writer = new RingBuffer(sab, Uint8Array);
	return { sab, writer };
}

/**
 * Create a reader handle from an existing SharedArrayBuffer.
 * Used by the DSP Worker to read IQ samples written by the USB Worker.
 *
 * @param sab SharedArrayBuffer previously created by createRingBuffer.
 * @returns A RingBuffer reader (pop) handle.
 */
export function getRingBufferReader(sab: SharedArrayBuffer): RingBuffer {
	return new RingBuffer(sab, Uint8Array);
}

/**
 * Get the ring buffer fill percentage.
 *
 * @param rb A RingBuffer instance (reader or writer).
 * @returns Fill percentage (0-100).
 */
export function getRingBufferFillPercent(rb: RingBuffer): number {
	const cap = rb.capacity();
	if (cap === 0) return 0;
	return (rb.availableRead() / cap) * 100;
}
