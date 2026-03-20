/**
 * Waterfall spectrogram renderer using Canvas 2D.
 *
 * Draws a scrolling waterfall display where each new FFT frame
 * becomes a colored row at the top, pushing previous rows down.
 * Uses a pre-computed RGBA colormap for signal strength mapping.
 */
export class WaterfallRenderer {
	private ctx: CanvasRenderingContext2D;
	private width: number;
	private height: number;
	private colormap: Uint8Array;
	private rowImageData: ImageData;

	constructor(
		ctx: CanvasRenderingContext2D,
		width: number,
		height: number,
		colormap: Uint8Array,
	) {
		this.ctx = ctx;
		this.width = width;
		this.height = height;
		this.colormap = colormap;
		this.rowImageData = ctx.createImageData(width, 1);
	}

	drawRow(spectrum: Float32Array, dbMin: number, dbMax: number): void {
		const { ctx, width, height, colormap, rowImageData } = this;
		const dbRange = dbMax - dbMin;
		const binCount = spectrum.length;
		const pixels = rowImageData.data;

		// 1. Scroll existing content down by 1 pixel
		ctx.drawImage(ctx.canvas, 0, 0, width, height, 0, 1, width, height);

		// 2. Map spectrum bins to pixel columns with colormap lookup
		for (let x = 0; x < width; x++) {
			const binIndex = Math.floor((x / width) * binCount);
			const db = spectrum[binIndex];
			const normalized = Math.max(
				0,
				Math.min(255, Math.floor(((db - dbMin) / dbRange) * 255)),
			);
			const cmapOffset = normalized * 4;
			const pxOffset = x * 4;
			pixels[pxOffset] = colormap[cmapOffset]; // R
			pixels[pxOffset + 1] = colormap[cmapOffset + 1]; // G
			pixels[pxOffset + 2] = colormap[cmapOffset + 2]; // B
			pixels[pxOffset + 3] = 255; // A
		}

		// 3. Draw new row at top
		ctx.putImageData(rowImageData, 0, 0);
	}

	resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
		this.rowImageData = this.ctx.createImageData(width, 1);
	}

	clear(): void {
		this.ctx.clearRect(0, 0, this.width, this.height);
	}
}
