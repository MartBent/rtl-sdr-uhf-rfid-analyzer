export type MainToUsbMessage =
	| { type: 'connect' }
	| { type: 'disconnect' }
	| { type: 'configure'; frequency: number; gain: number | null; sampleRate: number }
	| { type: 'start-capture' }
	| { type: 'stop-capture' };

export type UsbToMainMessage =
	| { type: 'status'; status: ConnectionStatus; error?: string }
	| { type: 'device-info'; name: string; serial?: string }
	| { type: 'stats'; samplesReceived: number; droppedSamples: number; bufferFill: number };

export type UsbToDspMessage =
	| { type: 'init'; sharedBuffer: SharedArrayBuffer }
	| { type: 'capture-started'; sampleRate: number; centerFrequency: number }
	| { type: 'capture-stopped' };

export type MainToDspMessage =
	| { type: 'set-fft-size'; size: number }
	| { type: 'set-averaging'; alpha: number };

export type DspToMainMessage =
	| { type: 'dsp-ready' }
	| { type: 'dsp-stats'; samplesProcessed: number }
	| { type: 'fft-data'; bins: Float32Array; binCount: number; centerFrequency: number; sampleRate: number };

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
