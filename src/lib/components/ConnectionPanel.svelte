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
			? 'bg-green-500'
			: sdrState.connectionStatus === 'connecting'
				? 'bg-yellow-500'
				: sdrState.connectionStatus === 'error'
					? 'bg-red-500'
					: 'bg-gray-500',
	);

	const statusText = $derived(
		sdrState.connectionStatus === 'connected'
			? 'Connected'
			: sdrState.connectionStatus === 'connecting'
				? 'Connecting...'
				: sdrState.connectionStatus === 'error'
					? sdrState.errorMessage || 'Error'
					: 'Disconnected',
	);

	const isConnected = $derived(sdrState.connectionStatus === 'connected');
	const isConnecting = $derived(sdrState.connectionStatus === 'connecting');
</script>

<div class="rounded border border-gray-700 bg-gray-900 p-4">
	<h3 class="mb-3 text-sm font-semibold text-gray-300">Connection</h3>

	<div class="flex items-center gap-3">
		<div class="flex items-center gap-2">
			<span class="inline-block h-2.5 w-2.5 rounded-full {statusColor}"></span>
			<span class="text-sm text-gray-400">{statusText}</span>
		</div>

		<div class="ml-auto flex gap-2">
			{#if isConnected}
				<button
					onclick={handleDisconnect}
					class="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-600"
				>
					Disconnect
				</button>
			{:else}
				<button
					onclick={handleConnect}
					disabled={isRequesting || isConnecting}
					class="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isRequesting || isConnecting ? 'Connecting...' : 'Connect'}
				</button>
			{/if}
		</div>
	</div>
</div>
