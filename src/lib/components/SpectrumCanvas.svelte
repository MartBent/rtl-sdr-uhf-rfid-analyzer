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

<section class="panel flex flex-col" aria-labelledby="spectrum-title">
	<div class="panel-hd">
		<h2 id="spectrum-title" class="card-title">Spectrum</h2>
		<span class="meta">
			<span class="num text-[var(--text)]">{spanStart}</span>–<span
				class="num text-[var(--text)]">{spanEnd}</span
			> MHz · <span class="num text-[var(--text)]">{displayState.dbMin}</span> to
			<span class="num text-[var(--text)]">{displayState.dbMax}</span> dB
		</span>
	</div>

	<div bind:this={containerEl} class="relative h-64 w-full overflow-hidden">
		<canvas bind:this={canvasEl} class="absolute inset-0"></canvas>

		{#if !sdrState.capturing}
			<!-- Honest empty state: the real scale is drawn, nothing is invented. -->
			<div class="absolute inset-0 px-4 pb-6 pt-4">
				<div class="relative h-full">
					<div class="absolute inset-x-0 bottom-0 h-px bg-[var(--control)]"></div>
					<div class="absolute left-0 top-0 tick num">{displayState.dbMax}</div>
					<div class="absolute bottom-2 left-0 tick num">{displayState.dbMin}</div>
					<div class="absolute inset-x-0 bottom-[-18px] flex justify-between">
						<span class="tick num">{spanStart}</span>
						<span class="tick num">{spanCentre}</span>
						<span class="tick num">{spanEnd}</span>
					</div>
					<p class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 meta">
						Start capture to plot the band.
					</p>
				</div>
			</div>
		{/if}
	</div>
</section>
