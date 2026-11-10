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

	/** Only a failing CRC needs a decision, so only it carries colour. */
	function crcMark(crcValid: boolean | null): { text: string; style: string } {
		if (crcValid === null) return { text: 'no CRC', style: 'color: var(--muted)' };
		return crcValid
			? { text: 'CRC ok', style: 'color: var(--muted)' }
			: {
					text: 'CRC failed',
					style:
						'background: var(--pill-negative-bg); color: var(--pill-negative-ink); padding: 1px 8px; border-radius: 999px;',
				};
	}
</script>

<div class="border-b border-[var(--rule)]">
	<button
		onclick={() => (expanded = !expanded)}
		aria-expanded={expanded}
		class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-[14px] py-2 text-left hover:bg-[var(--raised)]"
	>
		<span class="num w-24 shrink-0 text-right text-[var(--muted)]"
			>{formatTimestamp(command.timestamp)}</span
		>
		<span class="w-24 shrink-0 font-medium">{command.type}</span>
		<span class="num order-last w-full truncate text-[var(--muted)] sm:order-none sm:w-auto sm:flex-1"
			>{formatParams(command)}</span
		>
		<span class="meta shrink-0" style={crcMark(command.crcValid).style}>
			{crcMark(command.crcValid).text}
		</span>
		<svg
			class="h-3 w-3 shrink-0 transition-transform {expanded ? 'rotate-90' : ''}"
			style="color: var(--muted)"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
		</svg>
	</button>

	{#if expanded}
		<div class="num break-all px-[14px] pb-2 text-[var(--muted)]">
			{command.rawBits.length} bits · {command.rawBits.join('')}
		</div>
	{/if}
</div>
