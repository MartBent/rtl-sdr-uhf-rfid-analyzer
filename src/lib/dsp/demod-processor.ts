/**
 * DemodProcessor: TypeScript wrapper for the WASM PIE demodulator.
 *
 * Follows the FftProcessor pattern (init/process/dispose lifecycle).
 * Loads the Emscripten-compiled WASM module, allocates input/output
 * buffers in WASM linear memory, and marshals DemodSymbol structs
 * between JS and WASM heaps.
 *
 * Usage:
 *   const demod = new DemodProcessor();
 *   await demod.init(16384);
 *   const symbols = demod.process(iqData, byteCount, sampleRate, offset);
 *   demod.dispose();
 */

import type { DemodSymbol } from '$lib/protocol/gen2-types';

/** Emscripten module interface for the demod WASM binary */
interface DemodModule {
	_demod_process(
		inputPtr: number,
		byteCount: number,
		sampleRate: number,
		outputPtr: number,
		globalOffset: number
	): number;
	_demod_reset(): void;
	_demod_get_noise_floor(): number;
	_demod_get_state(): number;
	_malloc(bytes: number): number;
	_free(ptr: number): void;
	HEAPU8: Uint8Array;
	HEAP32: Int32Array;
	HEAPF32: Float32Array;
}

/** Bytes per DemodSymbol struct: 4 x int32/float = 16 bytes */
const SYMBOL_STRUCT_SIZE = 16;

/** Number of int32 fields per DemodSymbol struct */
const FIELDS_PER_SYMBOL = 4;

export class DemodProcessor {
	private module: DemodModule | null = null;
	private inputPtr: number = 0;
	private outputPtr: number = 0;
	private maxSamples: number = 0;

	/**
	 * Load the WASM module and allocate input/output buffers.
	 *
	 * @param maxSamples Maximum number of IQ sample pairs per process() call.
	 *                   Determines buffer sizes. Default 16384.
	 */
	async init(maxSamples: number = 16384): Promise<void> {
		// Dynamic import of WASM factory -- works in both worker and test contexts
		const createModule = (await import('../wasm/demod.mjs')).default;
		this.module = (await createModule()) as DemodModule;
		this.maxSamples = maxSamples;

		// Allocate input buffer: maxSamples * 2 bytes (IQ pairs, uint8)
		this.inputPtr = this.module._malloc(maxSamples * 2);

		// Allocate output buffer: worst case 1 symbol per sample
		this.outputPtr = this.module._malloc(maxSamples * SYMBOL_STRUCT_SIZE);
	}

	/**
	 * Process raw IQ samples through the WASM envelope detector.
	 *
	 * @param iqData Raw uint8 IQ data (interleaved I,Q bytes)
	 * @param length Number of bytes to process from iqData
	 * @param sampleRate Sample rate in Hz
	 * @param globalSampleOffset Added to symbol offsets for continuous timing
	 * @returns Array of DemodSymbol pulse events
	 */
	process(
		iqData: Uint8Array,
		length: number,
		sampleRate: number,
		globalSampleOffset: number = 0
	): DemodSymbol[] {
		if (!this.module) throw new Error('DemodProcessor not initialized');

		const byteCount = Math.min(length, this.maxSamples * 2);

		// Copy IQ data into WASM heap
		this.module.HEAPU8.set(iqData.subarray(0, byteCount), this.inputPtr);

		// Call C demod_process function
		const symbolCount = this.module._demod_process(
			this.inputPtr,
			byteCount,
			sampleRate,
			this.outputPtr,
			globalSampleOffset
		);

		// Read results from WASM heap
		return this.readSymbols(symbolCount);
	}

	/**
	 * Reset demodulator state for a new capture session.
	 */
	reset(): void {
		if (this.module) this.module._demod_reset();
	}

	/**
	 * Return current noise floor estimate (for display/debugging).
	 */
	getNoiseFloor(): number {
		return this.module?._demod_get_noise_floor() ?? 0;
	}

	/**
	 * Free WASM memory and release the module.
	 * Safe to call multiple times.
	 */
	dispose(): void {
		if (this.module) {
			this.module._free(this.inputPtr);
			this.module._free(this.outputPtr);
			this.module = null;
		}
	}

	/**
	 * Read DemodSymbol structs from WASM heap output buffer.
	 *
	 * Memory layout per symbol (16 bytes):
	 *   int32 sample_offset     [HEAP32 offset + 0]
	 *   int32 duration_samples  [HEAP32 offset + 1]
	 *   int32 symbol_type       [HEAP32 offset + 2]  (0=low, 1=high)
	 *   float amplitude         [HEAPF32 offset + 3]
	 */
	private readSymbols(count: number): DemodSymbol[] {
		if (!this.module || count === 0) return [];

		const symbols: DemodSymbol[] = [];
		const baseOffset = this.outputPtr / 4; // Convert byte offset to int32 index

		for (let i = 0; i < count; i++) {
			const idx = baseOffset + i * FIELDS_PER_SYMBOL;
			symbols.push({
				type:
					this.module.HEAP32[idx + 2] === 1
						? 'pulse-high'
						: 'pulse-low',
				sampleOffset: this.module.HEAP32[idx],
				durationSamples: this.module.HEAP32[idx + 1],
				amplitude: this.module.HEAPF32[idx + 3],
			});
		}

		return symbols;
	}
}
