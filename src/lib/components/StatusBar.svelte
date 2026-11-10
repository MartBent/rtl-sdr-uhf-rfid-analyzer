<script lang="ts">
	import { sdrState } from '$lib/state/sdr-state.svelte';
	import { captureStats } from '$lib/state/stats-state.svelte';
	import { REGION_PRESETS } from '$lib/config/regions';

	const regionName = $derived(REGION_PRESETS[sdrState.region]?.name ?? sdrState.region);
</script>

<header
	class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[var(--border)] px-6 py-3"
>
	<div class="flex items-center gap-2">
		<!-- The mark is the thing itself: a PIE pulse train, delimiter first. -->
		<svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true" class="shrink-0">
			<path
				d="M1 3 H3 V13 H5 V3 H9 V13 H11 V3 H17 V13 H19 V3 H21"
				fill="none"
				stroke="var(--accent)"
				stroke-width="1.5"
			/>
		</svg>
		<span class="font-semibold">UHF RFID Analyzer</span>
		<span class="meta num">{__APP_VERSION__}</span>
	</div>

	<div class="flex flex-wrap items-center gap-x-5 gap-y-1">
		<span class="meta">{regionName}</span>
		<span class="meta">
			<span class="num text-[var(--text)]">{(sdrState.frequency / 1_000_000).toFixed(3)}</span> MHz
		</span>
		<span class="meta">
			<span class="num text-[var(--text)]">{(sdrState.sampleRate / 1_000_000).toFixed(1)}</span> MSPS
		</span>
		<span class="meta">
			Gain
			<span class="num text-[var(--text)]">
				{sdrState.gain === null ? 'AGC' : sdrState.gain.toFixed(1) + ' dB'}
			</span>
		</span>
	</div>

	<div class="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1">
		<span class="meta">
			Samples <span class="num text-[var(--text)]">
				{captureStats.samplesReceived.toLocaleString('en-GB')}
			</span>
		</span>
		<span class="meta">
			Dropped
			<span
				class="num"
				style="color: {captureStats.droppedSamples > 0
					? 'var(--negative)'
					: 'var(--text)'}"
			>
				{captureStats.droppedSamples.toLocaleString('en-GB')}
			</span>
		</span>
		<span class="meta">
			Buffer <span class="num text-[var(--text)]">{captureStats.bufferFillPercent.toFixed(0)}%</span>
		</span>
	</div>
</header>
