/**
 * Generate a Blackman-Harris window function of the given size.
 *
 * Uses the 4-term Blackman-Harris formula:
 *   w[n] = a0 - a1*cos(2*PI*n/N) + a2*cos(4*PI*n/N) - a3*cos(6*PI*n/N)
 * where N = size - 1.
 */
export function generateBlackmanHarris(size: number): Float32Array {
	const a0 = 0.35875;
	const a1 = 0.48829;
	const a2 = 0.14128;
	const a3 = 0.01168;
	const N = size - 1;
	const window = new Float32Array(size);
	const twoPi = 2 * Math.PI;

	for (let n = 0; n < size; n++) {
		const ratio = n / N;
		window[n] =
			a0 -
			a1 * Math.cos(twoPi * ratio) +
			a2 * Math.cos(2 * twoPi * ratio) -
			a3 * Math.cos(3 * twoPi * ratio);
	}

	return window;
}
