/** RTL2832U USB Vendor ID (Realtek Semiconductor). */
export const RTL_USB_VENDOR_ID = 0x0bda;

/** Known RTL2832U USB Product IDs. */
export const RTL_USB_PRODUCT_IDS = [0x2838, 0x2832] as const;

/** Default sample rate: 2.4 MSPS. Fixed per user decision. */
export const DEFAULT_SAMPLE_RATE = 2_400_000;

/** USB bulk transfer size in bytes. Multiple of 512 for efficiency. */
export const USB_TRANSFER_SIZE = 16384;

/**
 * Ring buffer capacity in bytes.
 * 4 MB = ~0.83 seconds at 2.4 MSPS (4.8 MB/s of 8-bit I/Q pairs).
 * Power-of-2 size for efficient ring buffer indexing.
 */
export const RING_BUFFER_SIZE = 4 * 1024 * 1024;

/** Interval in ms between stats reports from workers to main thread. */
export const STATS_REPORT_INTERVAL_MS = 500;
