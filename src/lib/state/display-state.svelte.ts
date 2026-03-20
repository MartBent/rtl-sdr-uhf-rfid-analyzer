export const displayState = $state({
	fftSize: 1024,
	averaging: 0.3,
	dbMin: -100,
	dbMax: 0,
	targetFps: 60,
	currentFps: 0,
	throttled: false,
});

/**
 * Set the FFT size. Must be a power of 2 in range [256, 2048].
 */
export function setFftSize(size: number): void {
	// Validate power of 2
	if (size < 256 || size > 2048 || (size & (size - 1)) !== 0) {
		return;
	}
	displayState.fftSize = size;
}

/**
 * Set the EMA averaging alpha. Clamped to [0.01, 1.0].
 */
export function setAveraging(alpha: number): void {
	displayState.averaging = Math.max(0.01, Math.min(1.0, alpha));
}

/**
 * Set the dB display range. Ensures min < max.
 */
export function setDbRange(min: number, max: number): void {
	if (min >= max) {
		return;
	}
	displayState.dbMin = min;
	displayState.dbMax = max;
}

/**
 * Update FPS tracking info.
 */
export function setFpsInfo(current: number, throttled: boolean): void {
	displayState.currentFps = current;
	displayState.throttled = throttled;
}
