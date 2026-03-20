<script lang="ts">
	import { sdrState } from '$lib/state/sdr-state.svelte';
	import { captureStats } from '$lib/state/stats-state.svelte';
</script>

<header class="flex items-center gap-4 border-b border-gray-700 bg-gray-900 px-4 py-2 text-xs">
	<span class="font-semibold text-gray-300">UHF RFID Analyzer</span>

	<div class="mx-2 h-4 w-px bg-gray-700"></div>

	<div class="flex items-center gap-4 text-gray-400">
		<span>
			<span class="text-gray-500">SR:</span>
			{(sdrState.sampleRate / 1_000_000).toFixed(1)} MSPS
		</span>

		<span>
			<span class="text-gray-500">CF:</span>
			{(sdrState.frequency / 1_000_000).toFixed(3)} MHz
		</span>

		<span>
			<span class="text-gray-500">Gain:</span>
			{sdrState.gain === null ? 'AGC' : sdrState.gain + ' dB'}
		</span>

		<div class="mx-1 h-4 w-px bg-gray-700"></div>

		<span>
			<span class="text-gray-500">Samples:</span>
			{captureStats.samplesReceived.toLocaleString()}
		</span>

		<span class={captureStats.droppedSamples > 0 ? 'text-red-400' : ''}>
			<span class="text-gray-500">Drops:</span>
			{captureStats.droppedSamples.toLocaleString()}
		</span>

		<span>
			<span class="text-gray-500">Buf:</span>
			{captureStats.bufferFillPercent.toFixed(0)}%
		</span>
	</div>
</header>
