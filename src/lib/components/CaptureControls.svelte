<script lang="ts">
	import type { WorkerBridge } from '$lib/workers/worker-bridge';
	import { sdrState } from '$lib/state/sdr-state.svelte';

	let { bridge }: { bridge: WorkerBridge } = $props();

	const isConnected = $derived(sdrState.connectionStatus === 'connected');
	const isCapturing = $derived(sdrState.capturing);

	function handleStartCapture() {
		bridge.startCapture();
	}

	function handleStopCapture() {
		bridge.stopCapture();
	}
</script>

<div class="rounded border border-gray-700 bg-gray-900 p-4">
	<h3 class="mb-3 text-sm font-semibold text-gray-300">Capture</h3>

	{#if isCapturing}
		<button
			onclick={handleStopCapture}
			class="w-full rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
		>
			Stop Capture
		</button>
	{:else}
		<button
			onclick={handleStartCapture}
			disabled={!isConnected}
			class="w-full rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
		>
			Start Capture
		</button>
	{/if}
</div>
