import webfft from 'webfft';
import { generateBlackmanHarris } from './window-functions';

/**
 * FFT Processor: converts raw IQ samples to dBFS magnitude spectrum.
 *
 * Pipeline: IQ conversion -> DC removal (IIR) -> Blackman-Harris windowing ->
 *           FFT -> magnitude (dBFS) -> FFT shift (DC centered) -> EMA averaging
 */
export class FftProcessor {
	private fft: InstanceType<typeof webfft>;
	private _fftSize: number;
	private alpha: number;
	private windowCoeffs: Float32Array;
	private avgSpectrum: Float32Array;
	private windowedInput: Float32Array;
	private iqFloat: Float32Array;
	private dcI: number = 0;
	private dcQ: number = 0;
	private initialized: boolean = false;

	get fftSize(): number {
		return this._fftSize;
	}

	constructor(fftSize: number = 1024, alpha: number = 0.3) {
		this._fftSize = fftSize;
		this.alpha = alpha;
		this.fft = new webfft(fftSize);
		this.windowCoeffs = generateBlackmanHarris(fftSize);
		this.avgSpectrum = new Float32Array(fftSize);
		this.windowedInput = new Float32Array(fftSize * 2); // interleaved complex
		this.iqFloat = new Float32Array(fftSize * 2); // interleaved I,Q float pairs
	}

	/**
	 * Process raw IQ samples into an averaged dBFS magnitude spectrum.
	 *
	 * @param rawIq - Unsigned 8-bit IQ data (interleaved I, Q bytes)
	 * @param offset - Byte offset into rawIq to start reading
	 * @param sampleCount - Number of IQ sample pairs to process (must equal fftSize)
	 * @returns Float32Array of length fftSize with dBFS values (DC centered via FFT shift)
	 */
	process(rawIq: Uint8Array, offset: number, sampleCount: number): Float32Array {
		const N = this._fftSize;

		// Convert unsigned 8-bit IQ to float [-1, 1] and remove DC via IIR filter
		for (let i = 0; i < sampleCount; i++) {
			const byteOffset = offset + i * 2;
			let iVal = (rawIq[byteOffset] - 127.5) / 127.5;
			let qVal = (rawIq[byteOffset + 1] - 127.5) / 127.5;

			// DC removal IIR filter: dc = dc * 0.999 + sample * 0.001
			this.dcI = this.dcI * 0.999 + iVal * 0.001;
			this.dcQ = this.dcQ * 0.999 + qVal * 0.001;
			iVal -= this.dcI;
			qVal -= this.dcQ;

			this.iqFloat[i * 2] = iVal;
			this.iqFloat[i * 2 + 1] = qVal;
		}

		// Apply Blackman-Harris window and prepare interleaved complex input
		for (let i = 0; i < N; i++) {
			const w = this.windowCoeffs[i];
			this.windowedInput[i * 2] = this.iqFloat[i * 2] * w; // real
			this.windowedInput[i * 2 + 1] = this.iqFloat[i * 2 + 1] * w; // imag
		}

		// Run FFT
		const fftOutput = this.fft.fft(this.windowedInput);

		// Compute dBFS magnitude with FFT shift (DC centered)
		const halfN = N >>> 1;
		const spectrum = new Float32Array(N);

		for (let i = 0; i < N; i++) {
			// FFT shift: display bin i = FFT output bin (i + N/2) % N
			const srcBin = (i + halfN) % N;
			const re = fftOutput[srcBin * 2];
			const im = fftOutput[srcBin * 2 + 1];
			const mag = Math.sqrt(re * re + im * im) / N;
			spectrum[i] = mag > 0 ? 20 * Math.log10(mag) : -150;
		}

		// EMA averaging
		if (!this.initialized) {
			this.avgSpectrum.set(spectrum);
			this.initialized = true;
		} else {
			for (let i = 0; i < N; i++) {
				this.avgSpectrum[i] =
					this.alpha * spectrum[i] + (1 - this.alpha) * this.avgSpectrum[i];
			}
		}

		return this.avgSpectrum;
	}

	/**
	 * Update processor configuration. Reinitializes if fftSize changes.
	 */
	updateConfig(config: { fftSize?: number; alpha?: number }): void {
		if (config.alpha !== undefined) {
			this.alpha = config.alpha;
		}

		if (config.fftSize !== undefined && config.fftSize !== this._fftSize) {
			this.fft.dispose();
			this._fftSize = config.fftSize;
			this.fft = new webfft(this._fftSize);
			this.windowCoeffs = generateBlackmanHarris(this._fftSize);
			this.avgSpectrum = new Float32Array(this._fftSize);
			this.windowedInput = new Float32Array(this._fftSize * 2);
			this.iqFloat = new Float32Array(this._fftSize * 2);
			this.dcI = 0;
			this.dcQ = 0;
			this.initialized = false;
		}
	}

	/**
	 * Dispose of resources (webfft instance).
	 */
	dispose(): void {
		this.fft.dispose();
	}
}
