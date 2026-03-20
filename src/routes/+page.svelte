<script lang="ts">
	import { onMount } from 'svelte';
	import { detectFeatures, getMissingFeatureMessage } from '$lib/utils/feature-detect';
	import { createWorkerBridge, type WorkerBridge } from '$lib/workers/worker-bridge';
	import UnsupportedBanner from '$lib/components/UnsupportedBanner.svelte';
	import ConnectionPanel from '$lib/components/ConnectionPanel.svelte';
	import TuningPanel from '$lib/components/TuningPanel.svelte';
	import CaptureControls from '$lib/components/CaptureControls.svelte';
	import DisplayPanel from '$lib/components/DisplayPanel.svelte';
	import SpectrumCanvas from '$lib/components/SpectrumCanvas.svelte';
	import WaterfallCanvas from '$lib/components/WaterfallCanvas.svelte';
	import DecodedOutputPanel from '$lib/components/DecodedOutputPanel.svelte';
	import DecodeControlsPanel from '$lib/components/DecodeControlsPanel.svelte';

	let unsupportedMessage = $state<string | null>(null);
	let bridge = $state<WorkerBridge | null>(null);
	let latestFftData = $state<{
		bins: Float32Array;
		binCount: number;
		centerFreq: number;
		sampleRate: number;
	} | null>(null);

	onMount(() => {
		const features = detectFeatures();
		const msg = getMissingFeatureMessage(features);

		if (msg) {
			unsupportedMessage = msg;
			return;
		}

		bridge = createWorkerBridge();

		bridge.onFftData = (bins, binCount, centerFreq, sampleRate) => {
			latestFftData = { bins, binCount, centerFreq, sampleRate };
		};

		return () => {
			bridge?.destroy();
		};
	});
</script>

{#if unsupportedMessage}
	<UnsupportedBanner message={unsupportedMessage} />
{:else if bridge}
	<div class="flex flex-1">
		<!-- Sidebar -->
		<aside class="flex w-72 flex-col gap-3 border-r border-gray-700 bg-gray-950 p-3">
			<ConnectionPanel {bridge} />
			<TuningPanel {bridge} />
			<CaptureControls {bridge} />
			<DisplayPanel {bridge} />
			<DecodeControlsPanel />
		</aside>

		<!-- Main content area -->
		<main class="flex flex-1 flex-col gap-3 p-3">
			<SpectrumCanvas fftData={latestFftData} />
			<WaterfallCanvas fftData={latestFftData} />
			<DecodedOutputPanel />
		</main>
	</div>
{:else}
	<div class="flex flex-1 items-center justify-center">
		<span class="text-gray-500">Initializing...</span>
	</div>
{/if}
