<script lang="ts">
	import { decodeState, clearCommandTimeline } from '$lib/state/decode-state.svelte';
	import DecodedCommandRow from './DecodedCommandRow.svelte';

	// Group commands by roundId for visual separation
	// Use $derived for reactive grouping
	let groupedCommands = $derived.by(() => {
		// Build groups: array of { roundId, commands, complete }
		const groups: Array<{
			roundId: number;
			commands: typeof decodeState.commands;
			complete: boolean;
		}> = [];
		let currentGroup: (typeof groups)[0] | null = null;

		for (const cmd of decodeState.commands) {
			if (!currentGroup || currentGroup.roundId !== cmd.roundId) {
				currentGroup = { roundId: cmd.roundId, commands: [], complete: false };
				groups.push(currentGroup);
			}
			currentGroup.commands.push(cmd);
		}

		// Mark completeness from round updates
		for (const round of decodeState.rounds) {
			const group = groups.find((g) => g.roundId === round.roundId);
			if (group) group.complete = round.complete;
		}

		return groups;
	});

	let crcPassRate = $derived(
		decodeState.stats.crcChecked > 0
			? ((decodeState.stats.crcPassed / decodeState.stats.crcChecked) * 100).toFixed(1)
			: '—'
	);

	// Auto-scroll: scroll to bottom when new commands arrive
	let scrollContainer: HTMLDivElement;
	let autoScroll = $state(true);

	function handleScroll() {
		if (!scrollContainer) return;
		const atBottom =
			scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 50;
		autoScroll = atBottom;
	}

	$effect(() => {
		// Trigger on commands length change
		const _len = decodeState.commands.length;
		if (autoScroll && scrollContainer) {
			requestAnimationFrame(() => {
				scrollContainer.scrollTop = scrollContainer.scrollHeight;
			});
		}
	});
</script>

<section class="panel flex max-h-[24rem] flex-col" aria-labelledby="decoded-title">
	<div class="panel-hd">
		<h2 id="decoded-title" class="card-title">Reader commands</h2>
		<div class="flex items-center gap-4">
			<span class="meta">
				<span class="num text-[var(--text)]">{decodeState.stats.totalCommands}</span> decoded
			</span>
			<span class="meta">
				CRC <span class="num text-[var(--text)]">{crcPassRate}</span>{crcPassRate === '—'
					? ''
					: '%'} passing
			</span>
			<span class="meta">
				<span class="num text-[var(--text)]"
					>{decodeState.stats.commandsPerSec.toFixed(0)}</span
				> cmd/s
			</span>
			{#if decodeState.commands.length > 0}
				<button onclick={clearCommandTimeline} class="btn-text">Clear</button>
			{/if}
		</div>
	</div>

	<!-- Column header: grey sentence case, no band, no tracking.
	     Hidden on a phone, where rows fold to two lines and carry their own labels. -->
	<div
		class="hidden items-center gap-3 border-b border-[var(--rule)] px-[14px] py-1.5 sm:flex"
		aria-hidden="true"
	>
		<span class="meta w-24 shrink-0 text-right">Offset</span>
		<span class="meta w-24 shrink-0">Command</span>
		<span class="meta flex-1">Parameters</span>
		<span class="meta shrink-0">Checksum</span>
		<span class="w-3 shrink-0"></span>
	</div>

	<div bind:this={scrollContainer} onscroll={handleScroll} class="flex-1 overflow-y-auto">
		{#if decodeState.commands.length === 0}
			<p class="meta px-[14px] py-4">
				{#if decodeState.active}
					Listening. Nothing has synced yet. Check the gain, and that a reader is powered.
				{:else}
					Start capture to decode reader commands.
				{/if}
			</p>
		{:else}
			{#each groupedCommands as group (group.roundId)}
				{#if group.roundId > 0}
					<div class="flex items-center gap-3 px-[14px] py-1">
						<span class="meta">Inventory round <span class="num">{group.roundId}</span></span>
						<div class="h-px flex-1 bg-[var(--rule)]"></div>
						{#if decodeState.showBackscatter && !group.complete}
							<span class="meta" style="color: var(--warning)">incomplete</span>
						{/if}
					</div>
				{/if}

				{#each group.commands as command (command.sampleOffset)}
					<DecodedCommandRow {command} />
				{/each}
			{/each}

			{#if decodeState.showBackscatter}
				{#each decodeState.backscatter as result}
					<div
						class="flex items-center gap-3 border-b border-[var(--rule)] px-[14px] py-2"
						title="Experimental backscatter decode"
					>
						<span class="meta w-24 shrink-0 text-right">tag</span>
						<span class="w-24 shrink-0 font-medium">{result.encoding}</span>
						<span class="num flex-1 truncate text-[var(--muted)]">{result.bits.join('')}</span>
						<span class="meta shrink-0">
							<span class="num">{(result.confidence * 100).toFixed(0)}</span>% confident
						</span>
						<span class="w-3 shrink-0"></span>
					</div>
				{/each}
			{/if}
		{/if}
	</div>
</section>
