<script lang="ts">
	import type { WorkerBridge } from '$lib/workers/worker-bridge';
	import { sdrState, setRegion, setFrequency, setGain } from '$lib/state/sdr-state.svelte';
	import { REGION_PRESETS, type RegionId } from '$lib/config/regions';
	import { R820T2_GAIN_STEPS } from '$lib/config/gain-steps';

	let { bridge }: { bridge: WorkerBridge } = $props();

	let collapsed = $state(false);
	let isAgc = $derived(sdrState.gain === null);
	const isDisabled = $derived(sdrState.connectionStatus !== 'connected');

	const regionEntries = Object.entries(REGION_PRESETS);

	function handleRegionChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		setRegion(target.value as RegionId);
		bridge.configure(sdrState.frequency, sdrState.gain, sdrState.sampleRate);
	}

	function handleFrequencyChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const mhz = parseFloat(target.value);
		if (!isNaN(mhz)) {
			setFrequency(Math.round(mhz * 1_000_000));
			bridge.configure(sdrState.frequency, sdrState.gain, sdrState.sampleRate);
		}
	}

	function handleAgcToggle() {
		if (isAgc) {
			// Switch to manual: use first gain step
			setGain(R820T2_GAIN_STEPS[0]);
		} else {
			// Switch to AGC
			setGain(null);
		}
		bridge.configure(sdrState.frequency, sdrState.gain, sdrState.sampleRate);
	}

	function handleGainChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const value = parseFloat(target.value);
		setGain(value);
		bridge.configure(sdrState.frequency, sdrState.gain, sdrState.sampleRate);
	}
</script>

<div class="rounded border border-gray-700 bg-gray-900">
	<button
		onclick={() => (collapsed = !collapsed)}
		class="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:bg-gray-800"
	>
		<span>Tuning</span>
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
			<!-- Region -->
			<div>
				<label for="region-select" class="mb-1 block text-xs text-gray-500">Region</label>
				<select
					id="region-select"
					value={sdrState.region}
					onchange={handleRegionChange}
					disabled={isDisabled}
					class="w-full rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-200 border border-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#each regionEntries as [id, preset]}
						<option value={id}>{preset.name}</option>
					{/each}
				</select>
			</div>

			<!-- Frequency -->
			<div>
				<label for="freq-input" class="mb-1 block text-xs text-gray-500">Frequency (MHz)</label>
				<input
					id="freq-input"
					type="number"
					value={(sdrState.frequency / 1_000_000).toFixed(3)}
					onchange={handleFrequencyChange}
					disabled={isDisabled}
					step="0.001"
					min="24"
					max="1766"
					class="w-full rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-200 border border-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
				/>
			</div>

			<!-- Gain -->
			<div>
				<div class="mb-1 flex items-center justify-between">
					<span class="text-xs text-gray-500">Gain</span>
					<label class="flex items-center gap-1.5 text-xs text-gray-400">
						<input
							type="checkbox"
							checked={isAgc}
							onchange={handleAgcToggle}
							disabled={isDisabled}
							class="accent-blue-500"
						/>
						AGC
					</label>
				</div>

				{#if !isAgc}
					<select
						value={sdrState.gain}
						onchange={handleGainChange}
						disabled={isDisabled}
						class="w-full rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-200 border border-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#each R820T2_GAIN_STEPS as step}
							<option value={step}>{step} dB</option>
						{/each}
					</select>
				{:else}
					<div class="rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-500 border border-gray-700">
						Automatic Gain Control
					</div>
				{/if}
			</div>

			<!-- Sample Rate -->
			<div>
				<span class="mb-1 block text-xs text-gray-500">Sample Rate</span>
				<div class="rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-400 border border-gray-700">
					{(sdrState.sampleRate / 1_000_000).toFixed(1)} MSPS
				</div>
			</div>
		</div>
	{/if}
</div>
