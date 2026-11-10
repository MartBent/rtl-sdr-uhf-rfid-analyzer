import { describe, it, expect } from 'vitest';
import { generateHeatmapColormap } from './colormap';

describe('generateHeatmapColormap', () => {
	it('returns Uint8Array of length 1024 (256 entries * 4 RGBA)', () => {
		const colormap = generateHeatmapColormap();
		expect(colormap).toBeInstanceOf(Uint8Array);
		expect(colormap.length).toBe(1024);
	});

	it('index 0 (black): R=0, G=0, B=0, A=255', () => {
		const colormap = generateHeatmapColormap();
		expect(colormap[0]).toBe(0); // R
		expect(colormap[1]).toBe(0); // G
		expect(colormap[2]).toBe(0); // B
		expect(colormap[3]).toBe(255); // A
	});

	it('index 255 (white): R=255, G=255, B=255, A=255', () => {
		const colormap = generateHeatmapColormap();
		const offset = 255 * 4;
		expect(colormap[offset]).toBe(255); // R
		expect(colormap[offset + 1]).toBe(255); // G
		expect(colormap[offset + 2]).toBe(255); // B
		expect(colormap[offset + 3]).toBe(255); // A
	});

	it('all alpha values are 255', () => {
		const colormap = generateHeatmapColormap();
		for (let i = 0; i < 256; i++) {
			expect(colormap[i * 4 + 3]).toBe(255);
		}
	});

	it('rises monotonically in luminance', () => {
		// The property a spectrogram ramp must have and that jet does not:
		// a brighter pixel always means a stronger bin.
		const colormap = generateHeatmapColormap();
		const lum = (i: number) =>
			0.2126 * colormap[i * 4] + 0.7152 * colormap[i * 4 + 1] + 0.0722 * colormap[i * 4 + 2];

		for (let i = 1; i < 256; i++) {
			expect(lum(i), `index ${i} is darker than ${i - 1}`).toBeGreaterThanOrEqual(lum(i - 1));
		}
	});

	it('stays on one hue: blue is never below red or green', () => {
		const colormap = generateHeatmapColormap();
		for (let i = 0; i < 256; i++) {
			const [r, g, b] = [colormap[i * 4], colormap[i * 4 + 1], colormap[i * 4 + 2]];
			expect(b, `index ${i}`).toBeGreaterThanOrEqual(r);
			expect(b, `index ${i}`).toBeGreaterThanOrEqual(g);
		}
	});

});
