import type { ConnectionStatus } from '$lib/workers/worker-messages';
import type { RegionId } from '$lib/config/regions';
import { REGION_PRESETS } from '$lib/config/regions';

export const sdrState = $state({
	connectionStatus: 'disconnected' as ConnectionStatus,
	errorMessage: '',
	frequency: 866_500_000,
	gain: null as number | null,
	sampleRate: 2_400_000,
	region: 'EU' as RegionId,
	capturing: false,
});

export function setRegion(regionId: RegionId): void {
	const preset = REGION_PRESETS[regionId];
	if (preset) {
		sdrState.region = regionId;
		sdrState.frequency = preset.centerFrequency;
	}
}

export function setFrequency(hz: number): void {
	sdrState.frequency = hz;
}

export function setGain(gain: number | null): void {
	sdrState.gain = gain;
}
