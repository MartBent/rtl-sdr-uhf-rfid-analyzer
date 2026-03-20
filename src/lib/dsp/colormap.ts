/**
 * Generate a 256-entry RGBA heatmap colormap.
 *
 * Returns a Uint8Array of length 1024 (256 entries * 4 bytes RGBA).
 * Color stops with linear interpolation:
 *   black(0.00) -> dark blue(0.15) -> blue(0.30) -> cyan(0.40) ->
 *   green(0.55) -> yellow(0.70) -> red(0.85) -> white(1.00)
 */
export function generateHeatmapColormap(): Uint8Array {
	const stops: [number, number, number, number][] = [
		[0.0, 0, 0, 0], // black
		[0.15, 0, 0, 128], // dark blue
		[0.3, 0, 0, 255], // blue
		[0.4, 0, 255, 255], // cyan
		[0.55, 0, 255, 0], // green
		[0.7, 255, 255, 0], // yellow
		[0.85, 255, 0, 0], // red
		[1.0, 255, 255, 255], // white
	];

	const colormap = new Uint8Array(256 * 4);

	for (let i = 0; i < 256; i++) {
		const t = i / 255;

		// Find the two stops surrounding t
		let lower = 0;
		for (let s = 0; s < stops.length - 1; s++) {
			if (t >= stops[s][0]) {
				lower = s;
			}
		}
		const upper = Math.min(lower + 1, stops.length - 1);

		const [tLow, rLow, gLow, bLow] = stops[lower];
		const [tHigh, rHigh, gHigh, bHigh] = stops[upper];

		// Interpolation factor within this segment
		const range = tHigh - tLow;
		const f = range > 0 ? (t - tLow) / range : 0;

		const offset = i * 4;
		colormap[offset] = Math.round(rLow + f * (rHigh - rLow)); // R
		colormap[offset + 1] = Math.round(gLow + f * (gHigh - gLow)); // G
		colormap[offset + 2] = Math.round(bLow + f * (bHigh - bLow)); // B
		colormap[offset + 3] = 255; // A
	}

	return colormap;
}
