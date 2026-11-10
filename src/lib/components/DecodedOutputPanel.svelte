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
			: '---'
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

<div class="flex min-h-[12rem] max-h-[24rem] flex-col rounded border border-gray-700 bg-gray-900">
	<!-- Header with stats -->
	<div class="flex items-center justify-between border-b border-gray-700 px-3 py-2">
		<span class="text-sm font-semibold text-gray-300">Decoded Commands</span>
		<div class="flex items-center gap-3 text-xs text-gray-500">
			<span>{decodeState.stats.totalCommands} cmds</span>
			<span>CRC: {crcPassRate}%</span>
			<span>{decodeState.stats.commandsPerSec.toFixed(0)} cmd/s</span>
			{#if decodeState.commands.length > 0}
				<button
					onclick={clearCommandTimeline}
					class="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
					title="Clear commands timeline"
				>
					Clear
				</button>
			{/if}
		</div>
	</div>

	<!-- Command list -->
	<div bind:this={scrollContainer} onscroll={handleScroll} class="flex-1 overflow-y-auto">
		{#if decodeState.commands.length === 0}
			<div class="flex h-full items-center justify-center py-8 text-sm text-gray-600">
				{#if decodeState.active}
					Waiting for RFID signals...
				{:else}
					Start capture to decode commands
				{/if}
			</div>
		{:else}
			{#each groupedCommands as group (group.roundId)}
				<!-- Round separator -->
				{#if group.roundId > 0}
					<div
						class="flex items-center gap-2 bg-gray-950 px-3 py-0.5 text-[10px] text-gray-600"
					>
						<span>Round {group.roundId}</span>
						<div class="h-px flex-1 bg-gray-800"></div>
						{#if decodeState.showBackscatter && !group.complete}
							<span class="text-amber-500">incomplete</span>
						{/if}
					</div>
				{/if}

				<!-- Commands in this round -->
				{#each group.commands as command (command.sampleOffset)}
					<DecodedCommandRow {command} />
				{/each}
			{/each}

			<!-- Backscatter results (inline, when toggle is ON) -->
			{#if decodeState.showBackscatter}
				{#each decodeState.backscatter as result}
					<div
						class="flex items-center gap-2 border-b border-gray-800 bg-amber-950/20 px-3 py-1.5 text-xs font-mono"
					>
						<span class="text-amber-500" title="Experimental backscatter decode">&#9888;</span>
						<span class="text-gray-500">{result.encoding}</span>
						<span class="flex-1 truncate text-gray-400">{result.bits.join('')}</span>
						<span class="text-amber-400">{(result.confidence * 100).toFixed(0)}%</span>
					</div>
				{/each}
			{/if}
		{/if}
	</div>
</div>
