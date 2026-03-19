export const captureStats = $state({
	samplesReceived: 0,
	droppedSamples: 0,
	bufferFillPercent: 0,
});

export function updateStats(
	samplesReceived: number,
	droppedSamples: number,
	bufferFill: number,
): void {
	captureStats.samplesReceived = samplesReceived;
	captureStats.droppedSamples = droppedSamples;
	captureStats.bufferFillPercent = bufferFill;
}

export function resetStats(): void {
	captureStats.samplesReceived = 0;
	captureStats.droppedSamples = 0;
	captureStats.bufferFillPercent = 0;
}
