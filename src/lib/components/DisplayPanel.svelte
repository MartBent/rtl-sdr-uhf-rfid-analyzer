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

	function handleFftSizeChange(event: Event) {
		const size = parseInt((event.target as HTMLSelectElement).value);
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

<div class="rounded border border-gray-700 bg-gray-900">
	<button
		onclick={() => (collapsed = !collapsed)}
		class="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:bg-gray-800"
	>
		<span>Display</span>
		<svg
			class="h-4 w-4 text-gray-500 transition-transform {collapsed ? '' : 'rotate-180'}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if !collapsed}
		<div class="space-y-4 border-t border-gray-700 px-4 pb-4 pt-3">
			<!-- FFT Size -->
			<div>
				<label for="fft-size-select" class="mb-1 block text-xs text-gray-500">FFT Size</label>
				<select
					id="fft-size-select"
					value={displayState.fftSize}
					onchange={handleFftSizeChange}
					class="w-full rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-200 border border-gray-700"
				>
					{#each FFT_SIZES as size}
						<option value={size}>{size}</option>
					{/each}
				</select>
			</div>

			<!-- Averaging -->
			<div>
				<label for="averaging-range" class="mb-1 block text-xs text-gray-500"
					>Averaging ({displayState.averaging.toFixed(2)})</label
				>
				<input
					id="averaging-range"
					type="range"
					min="0.01"
					max="1.0"
					step="0.01"
					value={displayState.averaging}
					oninput={handleAveragingChange}
					class="w-full accent-blue-500"
				/>
			</div>

			<!-- dB Min -->
			<div>
				<label for="db-min-input" class="mb-1 block text-xs text-gray-500">dB Floor</label>
				<input
					id="db-min-input"
					type="number"
					value={displayState.dbMin}
					onchange={handleDbMinChange}
					min="-150"
					max="-10"
					class="w-full rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-200 border border-gray-700"
				/>
			</div>

			<!-- dB Max -->
			<div>
				<label for="db-max-input" class="mb-1 block text-xs text-gray-500">dB Ceiling</label>
				<input
					id="db-max-input"
					type="number"
					value={displayState.dbMax}
					onchange={handleDbMaxChange}
					min="-50"
					max="0"
					class="w-full rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-200 border border-gray-700"
				/>
			</div>

			<!-- FPS Indicator -->
			<div class="flex items-center justify-between text-xs">
				<span class="text-gray-500">FPS</span>
				<span class="text-gray-300">
					{displayState.currentFps} fps
					{#if displayState.throttled}
						<span class="text-amber-400">(throttled)</span>
					{/if}
				</span>
			</div>
		</div>
	{/if}
</div>
