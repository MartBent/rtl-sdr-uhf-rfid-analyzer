/**
 * Spectrum line trace renderer using Canvas 2D.
 *
 * Draws a live spectrum with main trace, peak hold, grid lines,
 * and axis labels (dBFS on Y, MHz on X).
 */
export class SpectrumRenderer {
	private ctx: CanvasRenderingContext2D;
	private width: number;
	private height: number;
	private peakHold: Float32Array;
	private readonly DECAY_RATE = 0.3; // dB per frame
	private readonly TRACE_COLOR = '#00ff88';
	private readonly PEAK_COLOR = 'rgba(255,200,0,0.3)';
	private readonly GRID_COLOR = 'rgba(255,255,255,0.08)';
	private readonly LABEL_COLOR = '#9ca3af'; // gray-400
	private readonly LABEL_FONT = '10px monospace';

	constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
		this.ctx = ctx;
		this.width = width;
		this.height = height;
		this.peakHold = new Float32Array(0);
	}

	drawFrame(
		spectrum: Float32Array,
		dbMin: number,
		dbMax: number,
		centerFrequency: number,
		sampleRate: number,
	): void {
		const { ctx, width, height } = this;
		const dbRange = dbMax - dbMin;
		const binCount = spectrum.length;

		// Ensure peak hold buffer matches spectrum size
		if (this.peakHold.length !== binCount) {
			this.peakHold = new Float32Array(binCount);
			this.peakHold.fill(dbMin);
		}

		// 1. Clear
		ctx.clearRect(0, 0, width, height);

		// 2. Draw grid
		this.drawGrid(dbMin, dbMax, dbRange, centerFrequency, sampleRate);

		// 3. Update peak hold
		for (let i = 0; i < binCount; i++) {
			if (spectrum[i] > this.peakHold[i]) {
				this.peakHold[i] = spectrum[i];
			} else {
				this.peakHold[i] -= this.DECAY_RATE;
				if (this.peakHold[i] < dbMin) {
					this.peakHold[i] = dbMin;
				}
			}
		}

		// 4. Draw peak hold trace
		this.drawTrace(this.peakHold, binCount, dbMin, dbRange, this.PEAK_COLOR, 1);

		// 5. Draw main trace
		this.drawTrace(spectrum, binCount, dbMin, dbRange, this.TRACE_COLOR, 1);
	}

	resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
		// Reallocate peak hold buffer - will be recreated on next drawFrame
		this.peakHold = new Float32Array(0);
	}

	private drawGrid(
		dbMin: number,
		dbMax: number,
		dbRange: number,
		centerFrequency: number,
		sampleRate: number,
	): void {
		const { ctx, width, height } = this;

		ctx.save();
		ctx.strokeStyle = this.GRID_COLOR;
		ctx.lineWidth = 1;
		ctx.font = this.LABEL_FONT;
		ctx.fillStyle = this.LABEL_COLOR;

		// Horizontal grid lines every 10 dB
		const dbStart = Math.ceil(dbMin / 10) * 10;
		const dbEnd = Math.floor(dbMax / 10) * 10;
		for (let db = dbStart; db <= dbEnd; db += 10) {
			const y = height - ((db - dbMin) / dbRange) * height;
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
			ctx.stroke();
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			ctx.fillText(`${db} dB`, 4, y);
		}

		// Vertical grid lines every 0.5 MHz
		const startFreq = centerFrequency - sampleRate / 2;
		const endFreq = centerFrequency + sampleRate / 2;
		const freqStepHz = 500_000; // 0.5 MHz
		const firstMark = Math.ceil(startFreq / freqStepHz) * freqStepHz;

		ctx.textAlign = 'center';
		ctx.textBaseline = 'bottom';
		for (let freq = firstMark; freq <= endFreq; freq += freqStepHz) {
			const x = ((freq - startFreq) / sampleRate) * width;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
			ctx.stroke();
			ctx.fillText(`${(freq / 1e6).toFixed(1)}`, x, height - 2);
		}

		ctx.restore();
	}

	private drawTrace(
		data: Float32Array,
		binCount: number,
		dbMin: number,
		dbRange: number,
		color: string,
		lineWidth: number,
	): void {
		const { ctx, width, height } = this;

		ctx.beginPath();
		ctx.strokeStyle = color;
		ctx.lineWidth = lineWidth;

		for (let i = 0; i < binCount; i++) {
			const x = (i / binCount) * width;
			const normalized = (data[i] - dbMin) / dbRange;
			const y = Math.max(0, Math.min(height, height - normalized * height));

			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}

		ctx.stroke();
	}
}
