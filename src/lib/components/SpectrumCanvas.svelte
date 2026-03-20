<script lang="ts">
	import { onMount } from 'svelte';
	import { SpectrumRenderer } from '$lib/viz/spectrum-renderer';
	import { displayState, setFpsInfo } from '$lib/state/display-state.svelte';
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
	let renderer: SpectrumRenderer | null = null;
	let lastFftData: typeof fftData = null;

	// Auto-degrade state
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
		canvasEl.width = Math.floor(cssWidth * dpr);
		canvasEl.height = Math.floor(cssHeight * dpr);
		canvasEl.style.width = `${cssWidth}px`;
		canvasEl.style.height = `${cssHeight}px`;
		const ctx = canvasEl.getContext('2d')!;
		ctx.scale(dpr, dpr);
		renderer = new SpectrumRenderer(ctx, cssWidth, cssHeight);
	}

	function renderLoop(timestamp: number): void {
		const delta = timestamp - lastTimestamp;
		if (delta >= targetInterval) {
			lastTimestamp = timestamp;
			if (fftData && fftData !== lastFftData && renderer) {
				renderer.drawFrame(
					fftData.bins,
					displayState.dbMin,
					displayState.dbMax,
					fftData.centerFreq,
					fftData.sampleRate,
				);
				lastFftData = fftData;
			}
			// Performance tracking
			frameCount++;
			if (delta > targetInterval * 1.5) slowFrames++;
			if (frameCount >= 60) {
				const currentFps = Math.round(1000 / targetInterval);
				const isThrottled = targetInterval > 17;
				setFpsInfo(currentFps, isThrottled);
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
			<span class="text-sm text-gray-500">Spectrum -- start capture to view</span>
		</div>
	{/if}
</div>
