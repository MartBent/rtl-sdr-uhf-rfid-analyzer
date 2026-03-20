import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaterfallRenderer } from './waterfall-renderer';

function createMockContext(width = 800, height = 300) {
	const rowImageData = {
		data: new Uint8ClampedArray(width * 4),
		width,
		height: 1,
	};
	const ctx = {
		clearRect: vi.fn(),
		beginPath: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		stroke: vi.fn(),
		strokeRect: vi.fn(),
		fillText: vi.fn(),
		fillRect: vi.fn(),
		drawImage: vi.fn(),
		putImageData: vi.fn(),
		createImageData: vi.fn((w: number) => ({
			data: new Uint8ClampedArray(w * 4),
			width: w,
			height: 1,
		})),
		save: vi.fn(),
		restore: vi.fn(),
		canvas: { width, height },
		strokeStyle: '',
		fillStyle: '',
		lineWidth: 1,
		font: '',
	} as unknown as CanvasRenderingContext2D;

	return ctx;
}

function createTestColormap(): Uint8Array {
	const colormap = new Uint8Array(256 * 4);
	// Fill with a known pattern: index i has RGBA = (i, i, i, 255)
	for (let i = 0; i < 256; i++) {
		colormap[i * 4] = i; // R
		colormap[i * 4 + 1] = i; // G
		colormap[i * 4 + 2] = i; // B
		colormap[i * 4 + 3] = 255; // A
	}
	return colormap;
}

describe('WaterfallRenderer', () => {
	let ctx: CanvasRenderingContext2D;
	let colormap: Uint8Array;
	let renderer: WaterfallRenderer;

	beforeEach(() => {
		ctx = createMockContext();
		colormap = createTestColormap();
		renderer = new WaterfallRenderer(ctx, 800, 300, colormap);
	});

	it('constructor creates rowImageData via ctx.createImageData(width, 1)', () => {
		expect(ctx.createImageData).toHaveBeenCalledWith(800, 1);
	});

	it('drawRow calls ctx.drawImage for scroll (with canvas self-reference)', () => {
		const spectrum = new Float32Array(1024).fill(-50);
		renderer.drawRow(spectrum, -100, 0);

		expect(ctx.drawImage).toHaveBeenCalled();
		const drawImageCall = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls[0];
		// First argument should be the canvas element (self-reference for scroll)
		expect(drawImageCall[0]).toBe((ctx as unknown as { canvas: object }).canvas);
	});

	it('drawRow calls ctx.putImageData with rowImageData at (0, 0)', () => {
		const spectrum = new Float32Array(1024).fill(-50);
		renderer.drawRow(spectrum, -100, 0);

		expect(ctx.putImageData).toHaveBeenCalled();
		const putImageDataCall = (ctx.putImageData as ReturnType<typeof vi.fn>).mock.calls[0];
		// Position should be (0, 0)
		expect(putImageDataCall[1]).toBe(0);
		expect(putImageDataCall[2]).toBe(0);
	});

	it('drawRow maps spectrum values to correct colormap colors', () => {
		// Use a small width for easier verification
		const smallCtx = createMockContext(4, 100);
		const smallRenderer = new WaterfallRenderer(smallCtx, 4, 100, colormap);

		// Spectrum value at exactly halfway between dbMin and dbMax
		// dbMin=-100, dbMax=0, value=-50 -> normalized = ((-50 - -100) / 100) * 255 = 127
		const spectrum = new Float32Array(4).fill(-50);
		smallRenderer.drawRow(spectrum, -100, 0);

		const putCall = (smallCtx.putImageData as ReturnType<typeof vi.fn>).mock.calls[0];
		const imageData = putCall[0] as { data: Uint8ClampedArray };
		const normalized = Math.floor(((-50 - -100) / 100) * 255); // 127

		// Check first pixel RGBA values match colormap at index 127
		expect(imageData.data[0]).toBe(colormap[normalized * 4]); // R
		expect(imageData.data[1]).toBe(colormap[normalized * 4 + 1]); // G
		expect(imageData.data[2]).toBe(colormap[normalized * 4 + 2]); // B
		expect(imageData.data[3]).toBe(255); // A
	});

	it('resize recreates rowImageData with new width', () => {
		vi.mocked(ctx.createImageData).mockClear();

		renderer.resize(1024, 400);

		expect(ctx.createImageData).toHaveBeenCalledWith(1024, 1);
	});

	it('clear calls ctx.clearRect with full dimensions', () => {
		renderer.clear();

		expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 300);
	});

	it('drawRow clamps normalized values to [0, 255]', () => {
		const smallCtx = createMockContext(2, 100);
		const smallRenderer = new WaterfallRenderer(smallCtx, 2, 100, colormap);

		// Values beyond range: well above dbMax and well below dbMin
		const spectrum = new Float32Array([10, -200]);
		smallRenderer.drawRow(spectrum, -100, 0);

		const putCall = (smallCtx.putImageData as ReturnType<typeof vi.fn>).mock.calls[0];
		const imageData = putCall[0] as { data: Uint8ClampedArray };

		// First pixel: db=10, normalized = ((10 - -100) / 100) * 255 = 280.5 -> clamped to 255
		expect(imageData.data[0]).toBe(255); // R = colormap[255*4] = 255
		// Second pixel: db=-200, normalized = ((-200 - -100) / 100) * 255 = -255 -> clamped to 0
		expect(imageData.data[4]).toBe(0); // R = colormap[0] = 0
	});
});
