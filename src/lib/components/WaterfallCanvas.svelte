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

<div
	bind:this={containerEl}
	class="relative h-64 w-full rounded border border-gray-700 bg-gray-900 overflow-hidden"
>
	<canvas bind:this={canvasEl} class="absolute inset-0"></canvas>
	{#if !sdrState.capturing}
		<div class="absolute inset-0 flex items-center justify-center">
			<span class="text-sm text-gray-500">Waterfall -- start capture to view</span>
		</div>
	{/if}
</div>
