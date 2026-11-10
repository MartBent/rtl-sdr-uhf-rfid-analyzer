<script lang="ts">
	import { onMount } from 'svelte';
	import { detectFeatures, getMissingFeatureMessage } from '$lib/utils/feature-detect';
	import { createWorkerBridge, type WorkerBridge } from '$lib/workers/worker-bridge';
	import { sdrState } from '$lib/state/sdr-state.svelte';
	import { decodeState } from '$lib/state/decode-state.svelte';
	import UnsupportedBanner from '$lib/components/UnsupportedBanner.svelte';
	import ConnectionPanel from '$lib/components/ConnectionPanel.svelte';
	import TuningPanel from '$lib/components/TuningPanel.svelte';
	import CaptureControls from '$lib/components/CaptureControls.svelte';
	import DisplayPanel from '$lib/components/DisplayPanel.svelte';
	import SpectrumCanvas from '$lib/components/SpectrumCanvas.svelte';
	import WaterfallCanvas from '$lib/components/WaterfallCanvas.svelte';
	import DecodedOutputPanel from '$lib/components/DecodedOutputPanel.svelte';
	import DecodeControlsPanel from '$lib/components/DecodeControlsPanel.svelte';
	import ReaderTiming from '$lib/components/ReaderTiming.svelte';

	let unsupportedMessage = $state<string | null>(null);
	let bridge = $state<WorkerBridge | null>(null);
	let latestFftData = $state<{
		bins: Float32Array;
		binCount: number;
		centerFreq: number;
		sampleRate: number;
	} | null>(null);

	/**
	 * The screen's one finding, in the words of the trade: what the capture is
	 * actually doing right now, stated once and read first.
	 */
	const finding = $derived.by(() => {
		if (sdrState.connectionStatus !== 'connected') {
			return 'No dongle paired. Connect an RTL-SDR to listen to a reader.';
		}
		if (!sdrState.capturing) {
			return `Paired and idle at ${(sdrState.frequency / 1_000_000).toFixed(3)} MHz.`;
		}
		if (decodeState.stats.totalCommands === 0) {
			return 'Listening. No reader command has synced yet.';
		}
		const checked = decodeState.stats.crcChecked;
		const passed = decodeState.stats.crcPassed;
		if (checked > 0 && passed === 0) {
			return `${decodeState.stats.totalCommands} commands synced, every CRC failing. Timing or threshold is off.`;
		}
		return `${decodeState.stats.totalCommands} commands decoded at Tari ${decodeState.stats.detectedTari.toFixed(2)} µs.`;
	});

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
	<div class="flex flex-1 flex-col">
		<!-- Title row: the screen's name, its one finding, and its one job -->
		<div class="flex flex-col gap-4 px-6 pb-4 pt-6 sm:flex-row sm:items-start sm:gap-6">
			<div class="min-w-0 flex-1">
				<h1 class="text-[26px] font-bold leading-tight">Reader capture</h1>
				<p class="mt-1 text-[var(--fs-section)] leading-snug text-[var(--muted)]">{finding}</p>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				<ConnectionPanel {bridge} />
				<CaptureControls {bridge} />
			</div>
		</div>

		<div class="border-t border-[var(--rule)]"></div>

		<div class="flex flex-1 flex-col gap-6 p-6 lg:flex-row">
			<!-- Readouts -->
			<main class="flex min-w-0 flex-1 flex-col gap-6">
				<SpectrumCanvas fftData={latestFftData} />
				<WaterfallCanvas fftData={latestFftData} />
				<DecodedOutputPanel />
			</main>

			<!-- Controls: one panel, grouped by rules rather than five boxes -->
			<aside class="flex w-full shrink-0 flex-col gap-6 lg:w-80">
				<ReaderTiming />
				<div class="panel">
					<TuningPanel {bridge} />
					<DisplayPanel {bridge} />
					<DecodeControlsPanel />
				</div>
			</aside>
		</div>
	</div>
{:else}
	<div class="flex flex-1 items-center justify-center">
		<span class="text-[var(--muted)]">Starting the worker pipeline…</span>
	</div>
{/if}
