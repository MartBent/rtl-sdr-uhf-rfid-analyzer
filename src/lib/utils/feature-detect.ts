export interface FeatureSupport {
	webusb: boolean;
	sharedArrayBuffer: boolean;
	crossOriginIsolated: boolean;
	workers: boolean;
}

export function detectFeatures(): FeatureSupport {
	return {
		webusb: typeof navigator !== 'undefined' && 'usb' in navigator,
		sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
		crossOriginIsolated: typeof self !== 'undefined' && self.crossOriginIsolated === true,
		workers: typeof Worker !== 'undefined',
	};
}

export function getMissingFeatureMessage(features: FeatureSupport): string | null {
	if (!features.webusb) {
		return "This browser doesn't support WebUSB. Use Chrome or Edge.";
	}
	if (!features.crossOriginIsolated) {
		return 'Cross-origin isolation is not enabled. SharedArrayBuffer is unavailable.';
	}
	return null;
}
