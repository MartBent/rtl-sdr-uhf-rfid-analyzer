<script lang="ts">
	import type { WorkerBridge } from '$lib/workers/worker-bridge';
	import {
		displayState,
		setFftSize,
		setAveraging,
		setDbRange,
	} from '$lib/state/display-state.svelte';

	let { bridge }: { bridge: WorkerBridge } = $props();
	let collapsed = $state(false);

	const FFT_SIZES = [256, 512, 1024, 2048];

	function selectFftSize(size: number) {
		setFftSize(size);
		bridge.setFftSize(size);
	}

	function handleAveragingChange(event: Event) {
		const value = parseFloat((event.target as HTMLInputElement).value);
		setAveraging(value);
		bridge.setAveraging(value);
	}

	function handleDbMinChange(event: Event) {
		const value = parseInt((event.target as HTMLInputElement).value);
		setDbRange(value, displayState.dbMax);
	}

	function handleDbMaxChange(event: Event) {
		const value = parseInt((event.target as HTMLInputElement).value);
		setDbRange(displayState.dbMin, value);
	}
</script>

<section class="group">
	<button
		onclick={() => (collapsed = !collapsed)}
		aria-expanded={!collapsed}
		class="flex w-full items-center justify-between"
	>
		<span class="card-title">Display</span>
		<svg
			class="h-4 w-4 transition-transform {collapsed ? '' : 'rotate-180'}"
			style="color: var(--muted)"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if !collapsed}
		<div class="mt-4 space-y-4">
			<div>
				<span class="lbl mb-1" id="fft-label">FFT size</span>
				<div class="seg" role="group" aria-labelledby="fft-label">
					{#each FFT_SIZES as size}
						<button
							class="seg-item num"
							aria-pressed={displayState.fftSize === size}
							onclick={() => selectFftSize(size)}
						>
							{size}
						</button>
					{/each}
				</div>
			</div>

			<div>
				<label for="averaging-range" class="lbl mb-1">
					Averaging <span class="num text-[var(--text)]">{displayState.averaging.toFixed(2)}</span>
				</label>
				<input
					id="averaging-range"
					type="range"
					min="0.01"
					max="1.0"
					step="0.01"
					value={displayState.averaging}
					oninput={handleAveragingChange}
					class="w-full"
				/>
			</div>

			<div class="flex gap-3">
				<div class="flex-1">
					<label for="db-min-input" class="lbl mb-1">Floor, dB</label>
					<input
						id="db-min-input"
						type="number"
						value={displayState.dbMin}
						onchange={handleDbMinChange}
						min="-150"
						max="-10"
						class="ctl"
					/>
				</div>
				<div class="flex-1">
					<label for="db-max-input" class="lbl mb-1">Ceiling, dB</label>
					<input
						id="db-max-input"
						type="number"
						value={displayState.dbMax}
						onchange={handleDbMaxChange}
						min="-50"
						max="0"
						class="ctl"
					/>
				</div>
			</div>

			<div class="flex items-baseline justify-between gap-3">
				<span class="meta">Redraw rate</span>
				<span class="meta">
					<span class="num text-[var(--text)]">{displayState.currentFps}</span> fps
					{#if displayState.throttled}
						<span style="color: var(--warning)">· throttled</span>
					{/if}
				</span>
			</div>
		</div>
	{/if}
</section>
