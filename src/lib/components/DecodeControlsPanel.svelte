<script lang="ts">
	import { decodeState, setShowBackscatter } from '$lib/state/decode-state.svelte';

	let collapsed = $state(false);

	function handleBackscatterToggle(event: Event) {
		setShowBackscatter((event.target as HTMLInputElement).checked);
	}
</script>

<div class="rounded border border-gray-700 bg-gray-900">
	<button
		onclick={() => (collapsed = !collapsed)}
		class="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:bg-gray-800"
	>
		<span>Decode</span>
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
		<div class="space-y-3 border-t border-gray-700 px-4 pb-4 pt-3">
			<!-- Detected Tari -->
			<div class="flex items-center justify-between text-xs">
				<span class="text-gray-500">Tari</span>
				<span class="text-gray-300">
					{decodeState.stats.detectedTari > 0
						? decodeState.stats.detectedTari.toFixed(2) + ' us'
						: '---'}
				</span>
			</div>

			<!-- Decode rate -->
			<div class="flex items-center justify-between text-xs">
				<span class="text-gray-500">Decode Rate</span>
				<span class="text-gray-300">{decodeState.stats.commandsPerSec.toFixed(0)} cmd/s</span>
			</div>

			<!-- Total decoded -->
			<div class="flex items-center justify-between text-xs">
				<span class="text-gray-500">Total Decoded</span>
				<span class="text-gray-300">{decodeState.stats.totalCommands}</span>
			</div>

			<!-- Backscatter toggle -->
			<div class="border-t border-gray-800 pt-3">
				<label class="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						checked={decodeState.showBackscatter}
						onchange={handleBackscatterToggle}
						class="accent-amber-500"
					/>
					<span class="text-xs text-gray-400">Experimental: Show tag responses</span>
				</label>
				{#if decodeState.showBackscatter}
					<p class="mt-1 text-[10px] text-amber-600">
						Tag backscatter decoding is best-effort. Results may contain errors.
					</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
