<script lang="ts">
	import { onMount } from 'svelte';
	import { WaterfallRenderer } from '$lib/viz/waterfall-renderer';
	import { generateHeatmapColormap } from '$lib/dsp/colormap';
	import { displayState } from '$lib/state/display-state.svelte';
	import { sdrState } from '$lib/state/sdr-state.svelte';

	let {
		fftData,
	}: {
		fftData: {
			bins: Float32Array;
			binCount: number;
			centerFreq: number;
			sampleRate: number;
		} | null;
	} = $props();

	let canvasEl: HTMLCanvasElement;
	let containerEl: HTMLDivElement;
	let renderer: WaterfallRenderer | null = null;
	let lastFftData: typeof fftData = null;
	let colormap: Uint8Array | null = null;

	// Auto-degrade state (shared timing with spectrum, but independent)
	let targetInterval = 1000 / 60;
	let lastTimestamp = 0;
	let frameCount = 0;
	let slowFrames = 0;
	let animFrameId = 0;

	function setupCanvas(): void {
		const dpr = window.devicePixelRatio || 1;
		const rect = containerEl.getBoundingClientRect();
		const cssWidth = rect.width;
		const cssHeight = rect.height;
		const deviceWidth = Math.floor(cssWidth * dpr);
		const deviceHeight = Math.floor(cssHeight * dpr);
		canvasEl.width = deviceWidth;
		canvasEl.height = deviceHeight;
		canvasEl.style.width = `${cssWidth}px`;
		canvasEl.style.height = `${cssHeight}px`;
		// Waterfall works in device pixels directly -- no ctx.scale
		const ctx = canvasEl.getContext('2d')!;
		if (!colormap) {
			colormap = generateHeatmapColormap();
		}
		renderer = new WaterfallRenderer(ctx, deviceWidth, deviceHeight, colormap);
	}

	function renderLoop(timestamp: number): void {
		const delta = timestamp - lastTimestamp;
		if (delta >= targetInterval) {
			lastTimestamp = timestamp;
			if (fftData && fftData !== lastFftData && renderer) {
				renderer.drawRow(fftData.bins, displayState.dbMin, displayState.dbMax);
				lastFftData = fftData;
			}
			// Performance tracking
			frameCount++;
			if (delta > targetInterval * 1.5) slowFrames++;
			if (frameCount >= 60) {
				if (slowFrames > 15 && targetInterval < 67) {
					targetInterval *= 2; // Degrade 60->30->15
				} else if (slowFrames < 6 && targetInterval > 17) {
					targetInterval /= 2; // Recover
				}
				frameCount = 0;
				slowFrames = 0;
			}
		}
		animFrameId = requestAnimationFrame(renderLoop);
	}

	const spanStart = $derived(
		((sdrState.frequency - sdrState.sampleRate / 2) / 1_000_000).toFixed(2),
	);
	const spanCentre = $derived((sdrState.frequency / 1_000_000).toFixed(2));
	const spanEnd = $derived(((sdrState.frequency + sdrState.sampleRate / 2) / 1_000_000).toFixed(2));

	onMount(() => {
		setupCanvas();
		animFrameId = requestAnimationFrame(renderLoop);

		const resizeObserver = new ResizeObserver(() => {
			setupCanvas();
		});
		resizeObserver.observe(containerEl);

		return () => {
			cancelAnimationFrame(animFrameId);
			resizeObserver.disconnect();
		};
	});
</script>

<section class="panel flex flex-col" aria-labelledby="waterfall-title">
	<div class="panel-hd">
		<h2 id="waterfall-title" class="card-title">Waterfall</h2>
		<div class="flex items-center gap-2">
			<span class="meta">weak</span>
			<span class="scale-ramp h-2 w-24 rounded-sm" aria-hidden="true"></span>
			<span class="meta">strong</span>
		</div>
	</div>

	<div bind:this={containerEl} class="relative h-64 w-full overflow-hidden">
		<canvas bind:this={canvasEl} class="absolute inset-0"></canvas>

		{#if !sdrState.capturing}
			<div class="absolute inset-0 px-4 pb-6 pt-4">
				<div class="relative h-full">
					<div class="absolute inset-x-0 bottom-0 h-px bg-[var(--control)]"></div>
					<div class="absolute inset-x-0 bottom-[-18px] flex justify-between">
						<span class="tick num">{spanStart}</span>
						<span class="tick num">{spanCentre}</span>
						<span class="tick num">{spanEnd}</span>
					</div>
					<p class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 meta">
						Start capture to fill the history.
					</p>
				</div>
			</div>
		{/if}
	</div>
</section>
