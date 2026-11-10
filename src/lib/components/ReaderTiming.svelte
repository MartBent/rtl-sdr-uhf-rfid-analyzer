<script lang="ts">
	/**
	 * Reader timing — the one readout only this product has.
	 *
	 * Gen2 fixes the delimiter at 12.5 us and allows Tari anywhere in 6.25-25 us;
	 * every other symbol on the air is a multiple of whatever Tari the reader
	 * chose. Plotting the measured Tari inside that window is how you see at a
	 * glance whether the capture is in spec before reading a single command.
	 *
	 * Only `detectedTari` is measured. The window bounds and the delimiter are
	 * constants from the spec and are labelled as such; nothing here is inferred
	 * from data the decoder has not actually produced.
	 */
	import { decodeState } from '$lib/state/decode-state.svelte';

	/** Gen2 Tari limits, in microseconds. */
	const TARI_MIN = 6.25;
	const TARI_MAX = 25;
	/** Fixed by the spec, not measured. */
	const DELIMITER_US = 12.5;

	const tari = $derived(decodeState.stats.detectedTari);
	const measured = $derived(tari >= TARI_MIN && tari <= TARI_MAX);
	/** Position of the measured Tari across the spec window, 0-1. */
	const position = $derived((tari - TARI_MIN) / (TARI_MAX - TARI_MIN));
	/** RTcal is data-0 + data-1, so it spans 2.5-3.0 Tari. */
	const rtcalRange = $derived(
		measured ? `${(tari * 2.5).toFixed(1)}–${(tari * 3).toFixed(1)}` : '—',
	);
</script>

<section class="panel" aria-labelledby="timing-title">
	<div class="panel-hd">
		<h2 id="timing-title" class="card-title">Reader timing</h2>
		<span class="meta">Gen2 symbol window</span>
	</div>

	<div class="px-[14px] py-4">
		<div class="flex items-baseline gap-2">
			<span class="num text-[26px] leading-none {measured ? '' : 'text-[var(--muted)]'}">
				{measured ? tari.toFixed(2) : '—'}
			</span>
			<span class="meta">µs Tari</span>
		</div>

		<!-- The spec window, drawn to scale. The mark is the measured Tari. -->
		<div class="mt-3">
			<div class="relative h-6">
				<!-- window -->
				<div class="absolute inset-x-0 top-[11px] h-px bg-[var(--control)]"></div>
				<!-- delimiter reference, fixed by the spec -->
				<div
					class="absolute top-[5px] h-[13px] w-px bg-[var(--border)]"
					style="left: {((DELIMITER_US - TARI_MIN) / (TARI_MAX - TARI_MIN)) * 100}%"
				></div>
				{#if measured}
					<div
						class="absolute top-0 h-6 w-px bg-[var(--accent)]"
						style="left: {position * 100}%"
					></div>
				{/if}
			</div>
			<div class="mt-1 flex justify-between">
				<span class="tick num">{TARI_MIN}</span>
				<span class="tick">µs</span>
				<span class="tick num">{TARI_MAX}</span>
			</div>
		</div>

		<dl class="mt-5 space-y-2 border-t border-[var(--rule)] pt-4">
			<div class="flex items-baseline justify-between gap-3">
				<dt class="meta">Delimiter, fixed</dt>
				<dd class="num">{DELIMITER_US.toFixed(2)} µs</dd>
			</div>
			<div class="flex items-baseline justify-between gap-3">
				<dt class="meta">RTcal, 2.5–3.0 Tari</dt>
				<dd class="num {measured ? '' : 'text-[var(--muted)]'}">{rtcalRange} µs</dd>
			</div>
			<div class="flex items-baseline justify-between gap-3">
				<dt class="meta">Commands synced</dt>
				<dd class="num">{decodeState.stats.totalCommands}</dd>
			</div>
		</dl>

		{#if !measured}
			<p class="meta mt-3">
				No frame sync yet. Tari is read from the data-0 symbol of the first preamble.
			</p>
		{/if}
	</div>
</section>
