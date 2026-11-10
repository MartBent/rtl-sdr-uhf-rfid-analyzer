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
	const currentRegion = $derived(REGION_PRESETS[sdrState.region]);

	function handleRegionSelect(id: string) {
		setRegion(id as RegionId);
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

	function handleGainMode(agc: boolean) {
		setGain(agc ? null : R820T2_GAIN_STEPS[0]);
		bridge.configure(sdrState.frequency, sdrState.gain, sdrState.sampleRate);
	}

	function handleGainChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		setGain(parseFloat(target.value));
		bridge.configure(sdrState.frequency, sdrState.gain, sdrState.sampleRate);
	}
</script>

<section class="group">
	<button
		onclick={() => (collapsed = !collapsed)}
		aria-expanded={!collapsed}
		class="flex w-full items-center justify-between"
	>
		<span class="card-title">Tuning</span>
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
			<!-- Region: the style's move — the active one carries a 1px accent line -->
			<div>
				<span class="lbl mb-1" id="region-label">Band</span>
				<div class="seg" role="group" aria-labelledby="region-label">
					{#each regionEntries as [id, preset]}
						<button
							class="seg-item"
							aria-pressed={sdrState.region === id}
							aria-label={preset.name}
							disabled={isDisabled}
							onclick={() => handleRegionSelect(id)}
						>
							{id}
						</button>
					{/each}
				</div>
				{#if currentRegion}
					<p class="meta mt-1">{currentRegion.description}</p>
				{/if}
			</div>

			<div>
				<label for="freq-input" class="lbl mb-1">Centre frequency, MHz</label>
				<input
					id="freq-input"
					type="number"
					value={(sdrState.frequency / 1_000_000).toFixed(3)}
					onchange={handleFrequencyChange}
					disabled={isDisabled}
					step="0.001"
					min="24"
					max="1766"
					class="ctl"
				/>
			</div>

			<div>
				<span class="lbl mb-1" id="gain-label">Gain</span>
				<div class="seg" role="group" aria-labelledby="gain-label">
					<button
						class="seg-item"
						aria-pressed={isAgc}
						disabled={isDisabled}
						onclick={() => handleGainMode(true)}
					>
						Automatic
					</button>
					<button
						class="seg-item"
						aria-pressed={!isAgc}
						disabled={isDisabled}
						onclick={() => handleGainMode(false)}
					>
						Fixed
					</button>
				</div>

				{#if !isAgc}
					<select
						value={sdrState.gain}
						onchange={handleGainChange}
						disabled={isDisabled}
						aria-label="Fixed gain in decibels"
						class="ctl mt-2"
					>
						{#each R820T2_GAIN_STEPS as step}
							<option value={step}>{step.toFixed(1)} dB</option>
						{/each}
					</select>
				{/if}
			</div>

			<div>
				<span class="lbl mb-1">Sample rate</span>
				<div class="ctl-static">
					<span class="num text-[var(--text)]"
						>{(sdrState.sampleRate / 1_000_000).toFixed(1)}</span
					>
					<span class="ml-1">MSPS</span>
				</div>
			</div>
		</div>
	{/if}
</section>
