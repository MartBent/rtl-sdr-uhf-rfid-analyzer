<script lang="ts">
	import { decodeState, setShowBackscatter } from '$lib/state/decode-state.svelte';

	let collapsed = $state(false);

	function handleBackscatterToggle(event: Event) {
		setShowBackscatter((event.target as HTMLInputElement).checked);
	}
</script>

<section class="group">
	<button
		onclick={() => (collapsed = !collapsed)}
		aria-expanded={!collapsed}
		class="flex w-full items-center justify-between"
	>
		<span class="card-title">Decode</span>
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
		<div class="mt-4 space-y-3">
			<div class="flex items-baseline justify-between gap-3">
				<span class="meta">Decode rate</span>
				<span class="meta">
					<span class="num text-[var(--text)]"
						>{decodeState.stats.commandsPerSec.toFixed(0)}</span
					> cmd/s
				</span>
			</div>

			<div class="flex items-baseline justify-between gap-3">
				<span class="meta">Commands decoded</span>
				<span class="num">{decodeState.stats.totalCommands}</span>
			</div>

			<div class="border-t border-[var(--rule)] pt-3">
				<label class="flex cursor-pointer items-start gap-2">
					<input
						type="checkbox"
						checked={decodeState.showBackscatter}
						onchange={handleBackscatterToggle}
						class="mt-0.5"
					/>
					<span class="meta">Show tag responses, best effort</span>
				</label>
				{#if decodeState.showBackscatter}
					<p class="meta mt-1">
						Backscatter decoding is unverified against hardware; rows may be wrong.
					</p>
				{/if}
			</div>
		</div>
	{/if}
</section>
