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

	it('mid-range around green-yellow has high G channel', () => {
		const colormap = generateHeatmapColormap();
		// Around index 140 (55% of 255 = ~140), should be in green region
		const offset = 140 * 4;
		expect(colormap[offset + 1]).toBeGreaterThan(200); // G should be high
	});

	it('has blue dominance in early indices', () => {
		const colormap = generateHeatmapColormap();
		// Around index 76 (30% of 255 = ~76), should be in blue region
		const offset = 76 * 4;
		expect(colormap[offset + 2]).toBeGreaterThan(200); // B should be high
	});
});
