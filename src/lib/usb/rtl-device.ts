import { RTL2832U } from '@jtarrio/webrtlsdr/rtlsdr.js';
import type { RtlDevice as IRtlDevice, SampleBlock } from '@jtarrio/webrtlsdr/rtlsdr.js';
import { RTL_USB_VENDOR_ID, RTL_USB_PRODUCT_IDS } from './usb-types.js';

/**
 * Wrapper around @jtarrio/webrtlsdr RTL2832U for use in the USB Worker.
 *
 * The main thread calls navigator.usb.requestDevice() for the user gesture.
 * The USB Worker then calls navigator.usb.getDevices() to find the same
 * paired device and does ALL USB I/O directly from the worker thread.
 */
export class RtlDevice {
	private device: IRtlDevice;
	private _isOpen: boolean;

	private constructor(device: IRtlDevice) {
		this.device = device;
		this._isOpen = true;
	}

	/**
	 * Find a paired RTL-SDR device via navigator.usb.getDevices() and open it.
	 * Must be called from a Worker context (or Window after requestDevice).
	 *
	 * @throws Error if no paired RTL-SDR device is found or connection fails.
	 */
	static async findAndConnect(): Promise<RtlDevice> {
		const devices = await navigator.usb.getDevices();
		const usbDevice = devices.find(
			(d) =>
				d.vendorId === RTL_USB_VENDOR_ID &&
				(RTL_USB_PRODUCT_IDS as readonly number[]).includes(d.productId),
		);

		if (!usbDevice) {
			throw new Error('Device not found');
		}

		try {
			const rtl = await RTL2832U.open(usbDevice);
			return new RtlDevice(rtl);
		} catch (err) {
			throw new Error(
				`Connection failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	/**
	 * Configure the RTL-SDR device: center frequency, gain, and sample rate.
	 *
	 * @param frequency Center frequency in Hz (e.g. 866_500_000 for EU UHF RFID).
	 * @param gain Gain in dB, or null for automatic gain control (AGC).
	 * @param sampleRate Sample rate in samples/sec (e.g. 2_400_000).
	 */
	async configure(frequency: number, gain: number | null, sampleRate: number): Promise<void> {
		await this.device.setSampleRate(sampleRate);
		await this.device.setCenterFrequency(frequency);
		await this.device.setGain(gain);
	}

	/**
	 * Read a block of IQ samples from the device.
	 *
	 * @param length Number of samples to read.
	 * @returns Raw IQ data as Uint8Array (interleaved U8 I/Q pairs).
	 */
	async readSamples(length: number): Promise<Uint8Array> {
		const block: SampleBlock = await this.device.readSamples(length);
		return new Uint8Array(block.data);
	}

	/**
	 * Reset the device sample buffer. Call before starting capture.
	 */
	async resetBuffer(): Promise<void> {
		await this.device.resetBuffer();
	}

	/**
	 * Close the RTL-SDR device and release USB resources.
	 */
	async close(): Promise<void> {
		if (this._isOpen) {
			try {
				await this.device.close();
			} catch {
				// Ignore close errors (device may already be disconnected)
			}
			this._isOpen = false;
		}
	}

	/** Whether the device handle is currently open. */
	get isOpen(): boolean {
		return this._isOpen;
	}
}
