<script lang="ts">
	import type {
		Gen2Command,
		QueryParams,
		QueryRepParams,
		QueryAdjustParams,
		AckParams,
		SelectParams,
		ReqRnParams,
	} from '$lib/protocol/gen2-types';

	let { command }: { command: Gen2Command } = $props();
	let expanded = $state(false);

	// Format key parameters per command type for display
	function formatParams(cmd: Gen2Command): string {
		switch (cmd.type) {
			case 'Query': {
				const p = cmd.params as QueryParams;
				return `DR=${p.dr} M=${p.m} Sess=${p.session} Q=${p.q} Tgt=${p.target}`;
			}
			case 'QueryRep': {
				const p = cmd.params as QueryRepParams;
				return `Sess=${p.session}`;
			}
			case 'QueryAdjust': {
				const p = cmd.params as QueryAdjustParams;
				return `Sess=${p.session} UpDn=${p.upDn}`;
			}
			case 'ACK': {
				const p = cmd.params as AckParams;
				return `RN16=0x${p.rn16.toString(16).padStart(4, '0').toUpperCase()}`;
			}
			case 'NAK':
				return '';
			case 'Select': {
				const p = cmd.params as SelectParams;
				return `Tgt=${p.target} Act=${p.action} Bank=${p.memBank} Len=${p.length}`;
			}
			case 'ReqRN': {
				const p = cmd.params as ReqRnParams;
				return `RN16=0x${p.rn16.toString(16).padStart(4, '0').toUpperCase()}`;
			}
			default:
				return '';
		}
	}

	function formatTimestamp(ms: number): string {
		return ms.toFixed(3) + ' ms';
	}

	function crcBadge(crcValid: boolean | null): { text: string; class: string } {
		if (crcValid === null) return { text: '', class: '' };
		return crcValid
			? { text: 'CRC OK', class: 'text-green-400' }
			: { text: 'CRC FAIL', class: 'text-red-400' };
	}
</script>

<div class="border-b border-gray-800 px-3 py-1.5 text-xs font-mono hover:bg-gray-800/50">
	<button
		onclick={() => (expanded = !expanded)}
		class="flex w-full items-center gap-3 text-left"
	>
		<!-- Timestamp -->
		<span class="w-20 shrink-0 text-gray-500">{formatTimestamp(command.timestamp)}</span>

		<!-- Command type -->
		<span class="w-20 shrink-0 font-semibold text-gray-200">{command.type}</span>

		<!-- Parameters -->
		<span class="flex-1 truncate text-gray-400">{formatParams(command)}</span>

		<!-- CRC badge -->
		{#if command.crcValid !== null}
			<span class="shrink-0 {crcBadge(command.crcValid).class}"
				>{crcBadge(command.crcValid).text}</span
			>
		{/if}

		<!-- Expand arrow -->
		<svg
			class="h-3 w-3 shrink-0 text-gray-600 transition-transform {expanded ? 'rotate-90' : ''}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
		</svg>
	</button>

	<!-- Expanded: raw bits -->
	{#if expanded}
		<div class="mt-1 rounded bg-gray-900 px-2 py-1 text-[10px] text-gray-500 break-all">
			{command.rawBits.join('')}
		</div>
	{/if}
</div>
