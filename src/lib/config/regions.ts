export interface RegionPreset {
	id: string;
	name: string;
	bandStart: number;
	bandEnd: number;
	centerFrequency: number;
	description: string;
}

export const REGION_PRESETS: Record<string, RegionPreset> = {
	EU: {
		id: 'EU',
		name: 'Europe (ETSI)',
		bandStart: 865_000_000,
		bandEnd: 868_000_000,
		centerFrequency: 866_500_000,
		description: '865-868 MHz (3 MHz, 4 channels)',
	},
	US: {
		id: 'US',
		name: 'US/FCC',
		bandStart: 902_000_000,
		bandEnd: 928_000_000,
		centerFrequency: 915_000_000,
		description: '902-928 MHz (26 MHz, 50 channels)',
	},
	CN: {
		id: 'CN',
		name: 'China',
		bandStart: 920_250_000,
		bandEnd: 924_750_000,
		centerFrequency: 922_500_000,
		description: '920-925 MHz (4.5 MHz)',
	},
	JP: {
		id: 'JP',
		name: 'Japan',
		bandStart: 916_700_000,
		bandEnd: 923_500_000,
		centerFrequency: 920_000_000,
		description: '916.7-923.5 MHz (6.8 MHz)',
	},
};

export type RegionId = keyof typeof REGION_PRESETS;
