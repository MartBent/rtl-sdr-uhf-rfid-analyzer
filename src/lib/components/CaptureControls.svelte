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

{#if isCapturing}
	<button onclick={handleStopCapture} class="btn btn-quiet">Stop capture</button>
{:else}
	<button
		onclick={handleStartCapture}
		disabled={!isConnected}
		class="btn {isConnected ? 'btn-primary' : 'btn-quiet'}"
	>
		Start capture
	</button>
{/if}
