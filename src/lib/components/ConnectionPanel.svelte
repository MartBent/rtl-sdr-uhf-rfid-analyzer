<script lang="ts">
	import type { WorkerBridge } from '$lib/workers/worker-bridge';
	import { sdrState } from '$lib/state/sdr-state.svelte';

	let { bridge }: { bridge: WorkerBridge } = $props();

	const RTL_SDR_FILTERS = [
		{ vendorId: 0x0bda, productId: 0x2838 },
		{ vendorId: 0x0bda, productId: 0x2832 },
	];

	let isRequesting = $state(false);

	async function handleConnect() {
		isRequesting = true;
		try {
			// Must call requestDevice on the main thread (requires user gesture).
			// This pairs the device so the worker can find it via getDevices().
			await navigator.usb.requestDevice({ filters: RTL_SDR_FILTERS });
			bridge.connect();
		} catch (err: unknown) {
			// User cancelled the device picker or no device found
			if (err instanceof DOMException && err.name === 'NotFoundError') {
				sdrState.connectionStatus = 'error';
				sdrState.errorMessage = 'No device selected';
			} else {
				sdrState.connectionStatus = 'error';
				sdrState.errorMessage = err instanceof Error ? err.message : 'Connection failed';
			}
		} finally {
			isRequesting = false;
		}
	}

	function handleDisconnect() {
		bridge.disconnect();
	}

	const statusColor = $derived(
		sdrState.connectionStatus === 'connected'
			? 'var(--positive)'
			: sdrState.connectionStatus === 'connecting'
				? 'var(--warning)'
				: sdrState.connectionStatus === 'error'
					? 'var(--negative)'
					: 'var(--control)',
	);

	const statusText = $derived(
		sdrState.connectionStatus === 'connected'
			? 'Dongle paired'
			: sdrState.connectionStatus === 'connecting'
				? 'Pairing…'
				: sdrState.connectionStatus === 'error'
					? sdrState.errorMessage || 'Pairing failed'
					: 'No dongle',
	);

	const isConnected = $derived(sdrState.connectionStatus === 'connected');
	const isConnecting = $derived(sdrState.connectionStatus === 'connecting');
</script>

<div class="flex items-center gap-3">
	<span class="flex items-center gap-2 meta">
		<span
			class="inline-block h-2 w-2 shrink-0 rounded-full"
			style="background: {statusColor}"
			aria-hidden="true"
		></span>
		{statusText}
	</span>

	{#if isConnected}
		<button onclick={handleDisconnect} class="btn btn-quiet">Unpair</button>
	{:else}
		<button
			onclick={handleConnect}
			disabled={isRequesting || isConnecting}
			class="btn btn-primary"
		>
			{isRequesting || isConnecting ? 'Pairing…' : 'Pair dongle'}
		</button>
	{/if}
</div>
