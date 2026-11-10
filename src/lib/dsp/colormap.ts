/**
 * Generate a 256-entry RGBA heatmap colormap.
 *
 * Returns a Uint8Array of length 1024 (256 entries * 4 bytes RGBA).
 *
 * A single-hue ramp whose lightness rises monotonically from black to white.
 * The previous stops were a jet rainbow (blue-cyan-green-yellow-red-white);
 * jet is not perceptually uniform, so it invents banding where the signal is
 * smooth and flattens real steps where it is not, and the red/green pair is
 * unreadable for the commonest colour blindness. One hue carries the whole
 * scale here, and the legend beside the waterfall shows it.
 */
export function generateHeatmapColormap(): Uint8Array {
	const stops: [number, number, number, number][] = [
		[0.0, 0, 0, 0],
		[0.18, 18, 34, 56],
		[0.38, 33, 74, 126],
		[0.58, 63, 111, 174],
		[0.76, 122, 169, 220],
		[0.9, 201, 220, 240],
		[1.0, 255, 255, 255],
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
