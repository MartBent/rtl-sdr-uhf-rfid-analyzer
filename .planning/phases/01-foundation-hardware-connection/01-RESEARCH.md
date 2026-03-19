# Phase 1: Foundation & Hardware Connection - Research

**Researched:** 2026-03-19
**Domain:** SvelteKit SPA scaffold, WebUSB RTL-SDR connection, worker threading, SharedArrayBuffer ring buffer
**Confidence:** HIGH

## Summary

Phase 1 establishes the entire application foundation: a SvelteKit 2 SPA with dark theme, WebUSB connection to RTL-SDR hardware, tuning controls for UHF RFID bands, and a two-worker threading architecture (USB Worker + DSP Worker) connected by a SharedArrayBuffer ring buffer. This phase produces no visualization or decoding -- it delivers the plumbing that all subsequent phases build on.

The most critical finding from this research is that **WebUSB is available in Web Workers** (Chrome 118+). The `navigator.usb` API is exposed in DedicatedWorker scope, including `getDevices()`, `open()`, `claimInterface()`, `transferIn()`, and `transferOut()`. Only `requestDevice()` (which requires a user gesture) is restricted to the Window context. This means the architecture can be cleaner than originally assumed: the main thread calls `requestDevice()` to get user permission, then the USB Worker calls `getDevices()` to find the same device and performs ALL USB I/O directly -- no need to proxy data through the main thread.

**Primary recommendation:** Scaffold with SvelteKit 2 (Svelte 5) + Vite 8 + adapter-static in SPA mode. Use `@jtarrio/webrtlsdr` v3.0.5 for RTL-SDR hardware access. Use `ringbuf.js` v0.4.0 for the SharedArrayBuffer SPSC ring buffer between USB and DSP workers. Configure COOP/COEP headers from day one in both Vite dev server and SvelteKit hooks.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Connection controls live inline in a sidebar/header panel -- no special first-run wizard or centered connect button
- WebUSB device picker filtered to known RTL2832U vendor/product IDs only -- prevent wrong device selection
- Minimal inline error messages on connection failure -- short text like "Device not found" or "Connection failed" next to the connect button, no platform-specific troubleshooting guidance
- Both explicit disconnect button and automatic detection of surprise USB removal with status update
- Region dropdown (EU/US/China/Japan) that auto-sets center frequency to the selected band
- Separate manual frequency input that overrides the region preset; changing region resets to default frequency
- Gain: default to AGC (automatic gain control); toggle to manual mode reveals a gain selector with RTL-SDR's discrete dB steps
- Sample rate fixed at 2.4 MSPS -- shown as read-only info, not user-configurable
- Tuning controls in a collapsible panel -- default open, user can collapse to save space for visualization
- Engineer-level detail always visible: sample rate, center freq, gain, samples received, drop count, buffer fill level
- Persistent status bar across the top of the application
- Separate start/stop capture button from connect/disconnect -- connect establishes the link, start/stop controls when IQ samples flow, allowing configuration before capture
- Full-page banner replacing app content when browser doesn't support WebUSB -- "This browser doesn't support WebUSB. Use Chrome or Edge." No point showing grayed-out controls
- Dark-only theme -- standard for RF/signal analysis tools, better contrast for spectrum displays in later phases
- Labeled placeholder panels for future phases -- empty panels showing "Spectrum (Phase 2)", "Waterfall (Phase 2)", "Timeline (Phase 4)" to communicate the vision and guide layout
- Minimal branding -- small "UHF RFID Analyzer" text in the status bar, no logo, no wasted space

### Claude's Discretion
- Overall layout structure (sidebar vs top-bar arrangement, panel proportions)
- Exact spacing, typography, and Tailwind styling
- Placeholder panel visual treatment (border style, text styling)
- Internal worker message protocol design
- Ring buffer sizing and configuration
- Error state wording and formatting details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HW-01 | User can discover and select an RTL-SDR V3/V4 dongle via WebUSB device picker | `@jtarrio/webrtlsdr` v3.0.5 `RTL2832U_Provider` with vendorId 0x0bda, productId 0x2838 filter. `requestDevice()` on main thread, `getDevices()` in USB Worker. |
| HW-02 | User can connect to selected RTL-SDR and see connection status (connected/disconnected/error) | `RTL2832U_Provider.get()` -> `device.open()` -> status messages via Comlink to main thread. `navigator.usb` `disconnect` event for surprise removal. |
| HW-03 | User can set manual gain level for the RTL-SDR tuner | `device.setGain(value)` with R820T2 discrete gain steps (0.0 to 49.6 dB, 29 discrete values). `null` for AGC. |
| HW-04 | User can set center frequency for the RTL-SDR | `device.setCenterFrequency(hz)` -- frequency in Hz. UHF RFID range: 840-928 MHz. |
| HW-05 | User can select sample rate for the RTL-SDR | Fixed at 2.4 MSPS per user decision. `device.setSampleRate(2400000)`. Shown as read-only. |
| TUNE-01 | User can select a UHF RFID region preset (EU/US/China/Japan) | Region presets with center frequencies: EU 866.5 MHz, US 915 MHz, China 922.5 MHz, Japan 920 MHz. Dropdown component. |
| TUNE-02 | Region selection auto-sets center frequency to the selected band | On region change, update frequency state and send `setCenterFrequency` to USB Worker. |
| TUNE-03 | User can manually override frequency within or outside region presets | Manual frequency input overrides region preset. Changing region resets to default. |
| INFRA-01 | Application runs as a client-side SPA with no server dependency | SvelteKit 2 + adapter-static in SPA mode. `ssr = false`, `fallback: 'index.html'`. |
| INFRA-02 | COOP/COEP headers configured for SharedArrayBuffer support | Vite `server.headers` for dev, SvelteKit `hooks.server.ts` for SSR, static headers for production. Verify with `crossOriginIsolated` global. |
| INFRA-03 | DSP processing runs in Web Workers (not on main thread) | USB Worker for device I/O, DSP Worker for signal processing. Main thread only for UI. SharedArrayBuffer ring buffer between workers. |
| INFRA-04 | Application displays clear error when browser does not support WebUSB | Check `navigator.usb` existence. Full-page banner if unsupported. Also check `crossOriginIsolated` for SharedArrayBuffer. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SvelteKit | 2.55.0 | SPA framework, routing, build | Svelte 5 runes provide fine-grained reactivity without VDOM. SPA mode via adapter-static. Verified Vite 8 peer dependency support. |
| Svelte | 5.54.0 | UI component framework | Compile-time reactivity, signals-based, minimal runtime (~1.6KB). Runes (`$state`, `$derived`, `$effect`) for state management. |
| Vite | 8.0.1 | Build tool, dev server, HMR | Rolldown bundler (10-30x faster builds). Native Worker support. SvelteKit 2.55.0 confirms `vite: ^8.0.0` peer dependency. |
| TypeScript | 5.x | Type safety | Typed ArrayBuffers, WebUSB types in lib.dom.d.ts, `@jtarrio/webrtlsdr` is 100% TypeScript. |
| `@jtarrio/webrtlsdr` | 3.0.5 | WebUSB RTL-SDR device access | Best-maintained TypeScript RTL-SDR library. v3 latest (published 2026-03-19). Low-level `RTL2832U_Provider` API for raw IQ access. Supports RTL-SDR Blog V3/V4. |
| Comlink | 4.4.2 | Worker RPC (control plane) | 1.1KB. Typed proxy interface for worker control messages. Google-maintained. NOT for high-bandwidth IQ data path. |
| ringbuf.js | 0.4.0 | SPSC SharedArrayBuffer ring buffer | Wait-free, zero-GC, TypeScript. Designed for real-time audio/SDR data transfer between threads. By Paul Adenot (Mozilla). |
| Tailwind CSS | 4.2.2 | Utility-first styling | Rust-based Oxide engine, Vite-native via `@tailwindcss/vite` plugin. No PostCSS dependency. Configuration via CSS `@theme` directives. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@sveltejs/adapter-static` | 3.0.10 | Static SPA output | Build-time only. Produces static files with `fallback: 'index.html'` for SPA mode. |
| `@tailwindcss/vite` | 4.2.2 | Tailwind Vite plugin | Dev/build dependency. Replaces PostCSS-based Tailwind integration. |
| vite-plugin-wasm | 3.6.0 | WASM ESM imports | Peer dependency supports Vite 8. Not needed in Phase 1 (WASM is Phase 3), but install now to avoid config changes later. |
| vite-plugin-top-level-await | 1.6.0 | Top-level await in modules | Companion to vite-plugin-wasm for cleaner async WASM initialization. |
| webfft | 1.0.3 | FFT computation | Install in Phase 1 but used in Phase 2. Auto-selects fastest FFT implementation (JS or WASM+SIMD). |
| coi-serviceworker | 0.1.7 | COOP/COEP polyfill | Only for deployment to hosts that cannot set custom HTTP headers (e.g., GitHub Pages). Include as optional fallback. |

### Development Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Vitest | 4.1.0 | Unit + integration testing |
| `@vitest/web-worker` | 4.1.0 | Worker simulation in tests |
| ESLint | latest | Code quality |
| Prettier | latest | Code formatting |
| `eslint-plugin-svelte` | latest | Svelte-specific linting |
| `prettier-plugin-svelte` | latest | Svelte formatting |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@jtarrio/webrtlsdr` | Direct WebUSB API | More control but must write RTL2832U/R820T2 register init from scratch. Only if webrtlsdr has a blocking bug. |
| `ringbuf.js` | Custom SharedArrayBuffer ring buffer | Simple SPSC is straightforward to implement. But ringbuf.js is battle-tested, TypeScript, and zero-GC. Use the library. |
| Comlink | Raw postMessage | Comlink adds type safety and proxy ergonomics. Raw postMessage only for performance-critical paths. |
| SvelteKit SPA | Vanilla Vite + Svelte | Lose routing, hooks, adapter ecosystem. SvelteKit's SPA mode has negligible overhead. |

**Installation:**
```bash
# Scaffold SvelteKit project
npx sv create uhf-rfid-analyzer --template minimal --types ts

# Core dependencies
npm install @jtarrio/webrtlsdr comlink ringbuf.js webfft

# Styling
npm install -D @tailwindcss/vite tailwindcss

# Vite plugins (WASM for later phases, install now)
npm install -D vite-plugin-wasm vite-plugin-top-level-await

# SPA adapter
npm install -D @sveltejs/adapter-static

# Testing
npm install -D vitest @vitest/web-worker

# Optional: COOP/COEP polyfill for restricted hosts
npm install coi-serviceworker
```

## Architecture Patterns

### Recommended Project Structure (Phase 1)

```
src/
+-- lib/
|   +-- usb/                    # USB Worker layer
|   |   +-- usb-worker.ts       # Web Worker entry point
|   |   +-- rtl-device.ts       # RTL-SDR device wrapper (uses @jtarrio/webrtlsdr)
|   |   +-- usb-types.ts        # USB message types
|   +-- dsp/                    # DSP Worker layer (skeleton in Phase 1)
|   |   +-- dsp-worker.ts       # Web Worker entry point
|   |   +-- ring-buffer.ts      # ringbuf.js wrapper for IQ samples
|   +-- state/                  # Reactive state management
|   |   +-- sdr-state.svelte.ts # SDR connection, tuning, capture state ($state runes)
|   |   +-- stats-state.svelte.ts # Sample count, drop count, buffer fill ($state runes)
|   +-- workers/                # Shared worker contracts
|   |   +-- worker-messages.ts  # Typed discriminated union message definitions
|   |   +-- worker-bridge.ts    # Main thread <-> worker communication setup
|   +-- config/                 # Application configuration
|   |   +-- regions.ts          # UHF RFID region presets (EU/US/China/Japan)
|   |   +-- gain-steps.ts      # R820T2 discrete gain values
+-- routes/
|   +-- +layout.svelte         # Root layout (dark theme, status bar)
|   +-- +layout.ts             # SPA mode: export const ssr = false
|   +-- +page.svelte           # Main page (controls, placeholders)
+-- hooks.server.ts            # COOP/COEP headers
+-- app.css                    # Tailwind imports + dark theme
+-- app.html                   # HTML shell
```

### Pattern 1: WebUSB Device Access via Worker

**What:** Main thread calls `requestDevice()` for the user gesture, then USB Worker calls `getDevices()` to find the same device and performs all I/O directly from the worker thread.

**When to use:** Always for this application. USB bulk transfers must not block the main thread.

**Key finding:** WebUSB `navigator.usb` is exposed in DedicatedWorker scope (Chrome 118+). The USBDevice interface methods (`open()`, `claimInterface()`, `transferIn()`, `transferOut()`) all work from workers. Only `requestDevice()` is Window-only.

**Example:**
```typescript
// Main thread: request permission (requires user gesture)
const device = await navigator.usb.requestDevice({
  filters: [
    { vendorId: 0x0bda, productId: 0x2838 }, // RTL2832U
    { vendorId: 0x0bda, productId: 0x2832 }, // RTL2832U alt
  ]
});
// Device is now "paired" -- worker can find it via getDevices()
usbWorker.postMessage({ type: 'connect' });

// USB Worker: find the paired device and do all I/O
// usb-worker.ts
const devices = await navigator.usb.getDevices();
const rtlDevice = devices.find(d =>
  d.vendorId === 0x0bda && (d.productId === 0x2838 || d.productId === 0x2832)
);
await rtlDevice.open();
await rtlDevice.selectConfiguration(1);
await rtlDevice.claimInterface(0);
// Now use @jtarrio/webrtlsdr RTL2832U class with this device
```

**Source:** [WebUSB Spec - Exposed=(Worker,Window)](https://wicg.github.io/webusb/), [MDN WebUSB API](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API)

### Pattern 2: SharedArrayBuffer Ring Buffer for IQ Samples

**What:** SPSC lock-free ring buffer backed by SharedArrayBuffer, using `ringbuf.js`. USB Worker writes IQ samples, DSP Worker reads them. Zero-copy, zero-GC data path.

**When to use:** Always for the USB-to-DSP data path. At 2.4 MSPS with 8-bit I/Q pairs, that is 4.8 MB/s. PostMessage with ArrayBuffer transfer creates GC pressure from repeated allocation.

**Ring buffer sizing (Claude's Discretion):**
- At 2.4 MSPS: 4.8 MB/s of raw IQ data
- Recommended buffer: 4 MB (about 0.83 seconds of data)
- This gives the DSP Worker comfortable headroom to handle processing bursts
- Power of 2 size: 4,194,304 bytes (2^22)

**Example:**
```typescript
// Initialization (main thread or coordinating worker)
import { RingBuffer } from 'ringbuf.js';

const sab = new SharedArrayBuffer(4 * 1024 * 1024 + RingBuffer.getStorageForCapacity(4 * 1024 * 1024, Uint8Array).byteLength);
const ringBuffer = new RingBuffer(sab, Uint8Array);

// Pass sab to both workers via postMessage during init
usbWorker.postMessage({ type: 'init', sharedBuffer: sab });
dspWorker.postMessage({ type: 'init', sharedBuffer: sab });

// USB Worker: write samples
const ringBuffer = new RingBuffer(sab, Uint8Array);
const samples = await device.readSamples(16384); // returns SampleBlock
const data = new Uint8Array(samples.data);
const written = ringBuffer.push(data);
if (written < data.length) {
  // Buffer overflow -- report drop count
}

// DSP Worker: read samples
const ringBuffer = new RingBuffer(sab, Uint8Array);
const output = new Uint8Array(16384);
const read = ringBuffer.pop(output);
if (read > 0) {
  // Process output.subarray(0, read)
}
```

**Source:** [ringbuf.js](https://github.com/padenot/ringbuf.js), [Chrome SharedArrayBuffer design pattern](https://googlechromelabs.github.io/web-audio-samples/audio-worklet/design-pattern/shared-buffer/)

### Pattern 3: Typed Worker Message Protocol

**What:** All worker communication uses TypeScript discriminated union types. Control messages (connect, configure, start/stop) go through Comlink. Status updates and stats go through typed postMessage.

**Example:**
```typescript
// workers/worker-messages.ts
export type MainToUsbMessage =
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'configure'; frequency: number; gain: number | null; sampleRate: number }
  | { type: 'start-capture' }
  | { type: 'stop-capture' };

export type UsbToMainMessage =
  | { type: 'status'; status: 'disconnected' | 'connecting' | 'connected' | 'error'; error?: string }
  | { type: 'device-info'; name: string; serial?: string }
  | { type: 'stats'; samplesReceived: number; droppedSamples: number; bufferFill: number };

export type UsbToDspMessage =
  | { type: 'init'; sharedBuffer: SharedArrayBuffer }
  | { type: 'capture-started'; sampleRate: number; centerFrequency: number }
  | { type: 'capture-stopped' };
```

### Pattern 4: Svelte 5 Runes State Management

**What:** Application state lives in `.svelte.ts` modules using `$state` runes. Workers push updates via postMessage, which update state. UI components reactively bind to state.

**Example:**
```typescript
// lib/state/sdr-state.svelte.ts
export const sdrState = $state({
  connectionStatus: 'disconnected' as 'disconnected' | 'connecting' | 'connected' | 'error',
  errorMessage: '',
  frequency: 866_500_000,  // Default EU center
  gain: null as number | null,  // null = AGC
  sampleRate: 2_400_000,
  region: 'EU' as 'EU' | 'US' | 'CN' | 'JP',
  capturing: false,
});

export const captureStats = $state({
  samplesReceived: 0,
  droppedSamples: 0,
  bufferFillPercent: 0,
});
```

### Pattern 5: COOP/COEP Headers Configuration

**What:** Cross-origin isolation headers required for SharedArrayBuffer. Must be configured in three places for SvelteKit.

**Example:**
```typescript
// vite.config.ts -- covers JS modules and static assets in dev
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});

// src/hooks.server.ts -- covers page/endpoint responses in dev
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return response;
};

// svelte.config.js -- SPA adapter
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: 'index.html' }),
  },
};
```

**Verification:** Check `self.crossOriginIsolated === true` at app startup. If false, SharedArrayBuffer is unavailable.

**Source:** [Cross-Origin Isolation with SvelteKit, Vite](https://www.captaincodeman.com/cross-origin-isolation-with-sveltekit-vite-and-firebase), [web.dev COOP/COEP guide](https://web.dev/articles/coop-coep)

### Anti-Patterns to Avoid

- **Processing IQ on main thread:** At 2.4 MSPS, you have ~0.4ms per 1024-sample block. Any main thread work causes sample drops and UI freezes. ALL USB I/O and DSP in workers.
- **PostMessage for every IQ buffer:** At 4.8 MB/s, postMessage with transfer creates 25 ArrayBuffer allocations/sec, causing GC pressure. Use SharedArrayBuffer ring buffer.
- **Opening WebUSB device on main thread then proxying data:** Since WebUSB works in workers, do ALL device I/O in the USB Worker directly. Only `requestDevice()` must be on the main thread.
- **Single monolithic worker:** Separate USB I/O and DSP into distinct workers. USB reads at its own cadence; DSP processes at its own cadence. Decoupling prevents backpressure.
- **Storing connection state in the worker:** Workers should be stateless pipes. All user-facing state lives in Svelte `$state` runes on the main thread. Workers report status; main thread is the source of truth.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SPSC ring buffer | Custom SharedArrayBuffer ring buffer | `ringbuf.js` 0.4.0 | Lock-free ring buffers are notoriously hard to get right. ringbuf.js is battle-tested, TypeScript, zero-GC, by Mozilla's Paul Adenot. |
| RTL2832U/R820T2 register init | Custom WebUSB register writes | `@jtarrio/webrtlsdr` 3.0.5 | RTL2832U init requires 100+ register writes in exact sequence. The library handles crystal frequency, PLL, IF, demod init, tuner init. |
| Worker RPC boilerplate | Custom postMessage/onmessage wrappers | `Comlink` 4.4.2 | Type-safe proxy, handles transferable objects, 1.1KB. Use for control plane only. |
| CSS dark theme system | Custom CSS variables + theme switcher | Tailwind CSS 4 dark mode | Dark-only per user decision. Tailwind's `dark:` variant is unnecessary -- just use dark colors directly. |
| SPA routing / build pipeline | Custom Vite config | SvelteKit + adapter-static | SPA mode with `ssr: false` + `fallback: 'index.html'` handles all routing, builds, and dev server concerns. |

## Common Pitfalls

### Pitfall 1: COOP/COEP Headers Missing or Incomplete
**What goes wrong:** SharedArrayBuffer is undefined. Ring buffer between workers cannot be created. Falls back to slow postMessage copy.
**Why it happens:** Headers must be set in THREE places for SvelteKit dev: Vite `server.headers`, SvelteKit `hooks.server.ts`, and `preview.headers`. Missing any one breaks it.
**How to avoid:** Set all three from day one. Verify with `self.crossOriginIsolated === true` at app startup. Display a clear error if false.
**Warning signs:** `SharedArrayBuffer is not defined` in console. `crossOriginIsolated` is false.

### Pitfall 2: WebUSB Device Claim Failure
**What goes wrong:** `claimInterface()` throws "Access denied" because another driver holds the USB device.
**Why it happens:** On Windows, the generic DVB-T driver claims the device. On Linux, `dvb_usb_rtl28xxu` kernel module loads. On macOS, a kernel extension may hold the device.
**How to avoid:** Per user decision: minimal inline error messages ("Device not found", "Connection failed") next to the connect button. No platform-specific troubleshooting. Log detailed error to console for engineers.
**Warning signs:** "Failed to claim interface" errors. Device appears in picker but connection fails.

### Pitfall 3: Surprise USB Disconnect Crashes App
**What goes wrong:** User unplugs RTL-SDR during capture. Worker's `transferIn()` rejects. If not caught, worker crashes silently.
**Why it happens:** USB is inherently unreliable -- cables get pulled, hubs reset, suspend happens.
**How to avoid:** Listen for `navigator.usb` `disconnect` event in both main thread and worker. Catch all USB operation errors in the worker read loop. On disconnect, update state to 'disconnected', stop capture gracefully, show status update.
**Warning signs:** App shows "connected" but no data flows. Worker silently stops posting messages.

### Pitfall 4: RTL-SDR Sample Drops via WebUSB
**What goes wrong:** Gaps in IQ sample stream corrupt downstream DSP. Drop counter shows non-zero.
**Why it happens:** WebUSB bulk transfers go through browser's USB stack with Promise resolution overhead. Small transfer sizes cause excessive scheduling overhead.
**How to avoid:** Use large transfer sizes (16384+ bytes, multiple of 512). Run all USB reads in dedicated worker. Ring buffer with overwrite semantics so USB reader never blocks. Expose drop counter in status bar (per user decision).
**Warning signs:** Drop count increasing during capture. Status bar shows non-zero drops.

### Pitfall 5: `@jtarrio/webrtlsdr` v3 API Changes
**What goes wrong:** Code examples from v2 don't work. Import paths changed.
**Why it happens:** v3 is a major version bump with new exports structure. Imports are now from `@jtarrio/webrtlsdr/rtlsdr.js`.
**How to avoid:** Import specifically: `import { RTL2832U_Provider } from "@jtarrio/webrtlsdr/rtlsdr.js"`. The library depends on `@jtarrio/signals` for its high-level Radio API, but we only use the low-level `RTL2832U_Provider` which has no such dependency.
**Warning signs:** "Module not found" errors on import. Types not resolving.

### Pitfall 6: Atomics.wait() on Main Thread
**What goes wrong:** `Atomics.wait()` is forbidden on the main thread (throws TypeError). If the main thread tries to wait for ring buffer data, it throws.
**Why it happens:** Blocking the main thread would freeze the UI. Browsers enforce this restriction.
**How to avoid:** Main thread NEVER waits on SharedArrayBuffer. Only workers use `Atomics.wait()`. Main thread uses `Atomics.waitAsync()` or polls via `requestAnimationFrame` (Phase 2+). In Phase 1, the main thread only reads stats, never IQ data.
**Warning signs:** TypeError about Atomics.wait on main thread.

## Code Examples

### UHF RFID Region Presets

```typescript
// lib/config/regions.ts
export interface RegionPreset {
  id: string;
  name: string;
  bandStart: number;  // Hz
  bandEnd: number;    // Hz
  centerFrequency: number;  // Hz -- default center for this region
  description: string;
}

export const REGION_PRESETS: Record<string, RegionPreset> = {
  EU: {
    id: 'EU',
    name: 'Europe (ETSI)',
    bandStart: 865_000_000,
    bandEnd: 868_000_000,
    centerFrequency: 866_500_000,  // Center of 865-868 MHz band
    description: '865-868 MHz (3 MHz, 4 channels)',
  },
  US: {
    id: 'US',
    name: 'US/FCC',
    bandStart: 902_000_000,
    bandEnd: 928_000_000,
    centerFrequency: 915_000_000,  // Center of 902-928 MHz band
    description: '902-928 MHz (26 MHz, 50 channels)',
  },
  CN: {
    id: 'CN',
    name: 'China',
    bandStart: 920_250_000,
    bandEnd: 924_750_000,
    centerFrequency: 922_500_000,  // Center of 920.25-924.75 MHz band
    description: '920-925 MHz (4.5 MHz)',
  },
  JP: {
    id: 'JP',
    name: 'Japan',
    bandStart: 916_700_000,
    bandEnd: 923_500_000,
    centerFrequency: 920_000_000,  // Center of 916.7-923.5 MHz band
    description: '916.7-923.5 MHz (6.8 MHz)',
  },
};
```

**Source:** [GS1 UHF Frequency Allocations](https://www.gs1.org/docs/epc/uhf_regulations.pdf), [atlasRFIDstore UHF Regulations](https://www.atlasrfidstore.com/rfid-insider/uhf-rfid-frequency-regulations/)

### R820T2 Discrete Gain Steps

```typescript
// lib/config/gain-steps.ts
// R820T2 tuner supports these discrete gain values (dB)
// If a non-matching value is set, the tuner selects the next lower step
export const R820T2_GAIN_STEPS = [
  0.0, 0.9, 1.4, 2.7, 3.7, 7.7, 8.7, 12.5, 14.4, 15.7,
  16.6, 19.7, 20.7, 22.9, 25.4, 28.0, 29.7, 32.8, 33.8,
  36.4, 37.2, 38.6, 40.2, 42.1, 43.4, 43.9, 44.5, 48.0, 49.6,
] as const;

export type GainValue = (typeof R820T2_GAIN_STEPS)[number] | null;  // null = AGC
```

**Source:** [RTL-SDR Blog Gain Control Functions](https://deepwiki.com/rtlsdrblog/rtl-sdr-blog/6.3-gain-control-functions)

### SvelteKit SPA Mode Configuration

```typescript
// src/routes/+layout.ts
export const ssr = false;
export const prerender = false;
```

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html',
    }),
  },
};
```

**Source:** [SvelteKit SPA docs](https://svelte.dev/docs/kit/single-page-apps)

### WebUSB Feature Detection

```typescript
// lib/utils/feature-detect.ts
export interface FeatureSupport {
  webusb: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  workers: boolean;
}

export function detectFeatures(): FeatureSupport {
  return {
    webusb: 'usb' in navigator,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    crossOriginIsolated: self.crossOriginIsolated === true,
    workers: typeof Worker !== 'undefined',
  };
}

export function getMissingFeatureMessage(features: FeatureSupport): string | null {
  if (!features.webusb) {
    return "This browser doesn't support WebUSB. Use Chrome or Edge.";
  }
  if (!features.crossOriginIsolated) {
    return "Cross-origin isolation is not enabled. SharedArrayBuffer is unavailable.";
  }
  return null;
}
```

### Worker Instantiation with Vite

```typescript
// lib/workers/worker-bridge.ts
export function createUsbWorker(): Worker {
  return new Worker(
    new URL('../usb/usb-worker.ts', import.meta.url),
    { type: 'module' }
  );
}

export function createDspWorker(): Worker {
  return new Worker(
    new URL('../dsp/dsp-worker.ts', import.meta.url),
    { type: 'module' }
  );
}
```

**Source:** [Vite Worker documentation](https://vite.dev/guide/features#web-workers)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebUSB main-thread only | WebUSB in DedicatedWorker | Chrome 118+ (spec updated) | USB I/O can run entirely in worker -- no main thread proxying needed |
| `create-svelte` | `sv create` (Svelte CLI) | Late 2024 | New project scaffolding command |
| Svelte stores (`writable`, `derived`) | Svelte 5 runes (`$state`, `$derived`, `$effect`) | Svelte 5 (Oct 2024) | No more store subscriptions, fine-grained signals-based reactivity |
| Tailwind CSS 3 (PostCSS, `tailwind.config.js`) | Tailwind CSS 4 (Vite plugin, CSS `@theme`) | Jan 2025 | No PostCSS, no config file, configuration via CSS directives |
| Vite 7 (esbuild/Rollup) | Vite 8 (Rolldown) | Mar 2026 | 10-30x faster builds, unified Rust-based bundler |
| `@jtarrio/webrtlsdr` v2 | v3.0.5 | 2026 | New export paths, v3 API. Import from `@jtarrio/webrtlsdr/rtlsdr.js` |
| Custom ring buffer | `ringbuf.js` 0.4.0 (TypeScript rewrite) | 2025 | Full TypeScript, optimized copy loops, zero-GC |

## Open Questions

1. **`@jtarrio/webrtlsdr` v3 Worker Compatibility**
   - What we know: The library uses WebUSB internally. WebUSB is available in workers. The library exports from `@jtarrio/webrtlsdr/rtlsdr.js`.
   - What's unclear: Whether `RTL2832U_Provider` works correctly when called from a Web Worker (it may internally reference `navigator.usb.requestDevice()` which is Window-only). The worker pattern may require: (1) call `requestDevice()` on main thread, (2) in worker, call `navigator.usb.getDevices()` to find the device, (3) manually instantiate RTL2832U with the device rather than using the Provider.
   - Recommendation: Test in Wave 0. If the Provider doesn't work in a worker, use `getDevices()` directly and wrap the raw USBDevice with the RTL2832U class.

2. **ringbuf.js Integration with @jtarrio/webrtlsdr SampleBlock**
   - What we know: webrtlsdr's `readSamples()` returns a `SampleBlock` with `data: ArrayBuffer` containing interleaved U8 I/Q pairs. ringbuf.js operates on `Uint8Array`.
   - What's unclear: Whether `new Uint8Array(sampleBlock.data)` creates a zero-copy view or a copy.
   - Recommendation: `new Uint8Array(buffer)` creates a view (zero-copy) when passed an ArrayBuffer. This should work efficiently. Verify during implementation.

3. **HMR with COOP/COEP Headers**
   - What we know: Vite 8's HMR WebSocket may have issues with COOP headers (known issue in Vite 7, tracked in vitejs/vite#16536).
   - What's unclear: Whether Vite 8 resolved this issue.
   - Recommendation: Test immediately after scaffold. If HMR breaks, the fallback is to set headers only on page requests (hooks.server.ts) and not on Vite's dev server static assets. SharedArrayBuffer requires cross-origin isolation on the page response, not necessarily on every sub-resource.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 + @vitest/web-worker 4.1.0 |
| Config file | `vitest.config.ts` (or inline in `vite.config.ts`) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HW-01 | WebUSB device picker shows RTL-SDR devices | manual-only | N/A -- requires physical USB device + browser UI gesture | N/A |
| HW-02 | Connection status updates (connected/disconnected/error) | unit | `npx vitest run src/lib/state/sdr-state.test.ts -t "connection status"` | Wave 0 |
| HW-03 | Gain setting with discrete R820T2 steps | unit | `npx vitest run src/lib/config/gain-steps.test.ts` | Wave 0 |
| HW-04 | Center frequency setting | unit | `npx vitest run src/lib/state/sdr-state.test.ts -t "frequency"` | Wave 0 |
| HW-05 | Sample rate is fixed at 2.4 MSPS | unit | `npx vitest run src/lib/config/regions.test.ts` | Wave 0 |
| TUNE-01 | Region preset selection (EU/US/CN/JP) | unit | `npx vitest run src/lib/config/regions.test.ts` | Wave 0 |
| TUNE-02 | Region auto-sets center frequency | unit | `npx vitest run src/lib/state/sdr-state.test.ts -t "region"` | Wave 0 |
| TUNE-03 | Manual frequency override | unit | `npx vitest run src/lib/state/sdr-state.test.ts -t "manual frequency"` | Wave 0 |
| INFRA-01 | SPA with no server dependency | smoke | Build succeeds: `npm run build && ls build/index.html` | Wave 0 |
| INFRA-02 | COOP/COEP headers present | unit | `npx vitest run src/lib/utils/feature-detect.test.ts` | Wave 0 |
| INFRA-03 | Workers instantiate without error | unit | `npx vitest run src/lib/workers/worker-bridge.test.ts` | Wave 0 |
| INFRA-04 | WebUSB unsupported banner shows | unit | `npx vitest run src/lib/utils/feature-detect.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` or vitest section in `vite.config.ts` -- test framework configuration
- [ ] `src/lib/config/regions.test.ts` -- covers TUNE-01, HW-05
- [ ] `src/lib/config/gain-steps.test.ts` -- covers HW-03
- [ ] `src/lib/state/sdr-state.test.ts` -- covers HW-02, HW-04, TUNE-02, TUNE-03
- [ ] `src/lib/utils/feature-detect.test.ts` -- covers INFRA-02, INFRA-04
- [ ] `src/lib/workers/worker-bridge.test.ts` -- covers INFRA-03
- [ ] Framework install: `npm install -D vitest @vitest/web-worker`

## Sources

### Primary (HIGH confidence)
- [WebUSB Spec](https://wicg.github.io/webusb/) -- USB interface Exposed=(Worker,Window), USBDevice Exposed=(Worker,Window), requestDevice Exposed=Window only
- [MDN WebUSB API](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API) -- WebUSB available in Web Workers confirmed
- [SvelteKit Single Page Apps docs](https://svelte.dev/docs/kit/single-page-apps) -- `ssr = false`, adapter-static with fallback
- [SvelteKit adapter-static docs](https://svelte.dev/docs/kit/adapter-static) -- Static SPA configuration
- [Svelte 5 $state docs](https://svelte.dev/docs/svelte/$state) -- Runes reactivity API
- [web.dev COOP/COEP guide](https://web.dev/articles/coop-coep) -- SharedArrayBuffer cross-origin isolation requirements
- [Cross-Origin Isolation with SvelteKit + Vite](https://www.captaincodeman.com/cross-origin-isolation-with-sveltekit-vite-and-firebase) -- Exact Vite + hooks.server.ts configuration
- [GS1 UHF Frequency Allocations](https://www.gs1.org/docs/epc/uhf_regulations.pdf) -- Authoritative UHF RFID band definitions
- [ringbuf.js](https://github.com/padenot/ringbuf.js) -- SPSC SharedArrayBuffer ring buffer, v0.4.0 TypeScript

### Secondary (MEDIUM confidence)
- [npm registry](https://www.npmjs.com/) -- Verified package versions: @jtarrio/webrtlsdr 3.0.5, comlink 4.4.2, ringbuf.js 0.4.0, webfft 1.0.3, tailwindcss 4.2.2, @sveltejs/kit 2.55.0, svelte 5.54.0, vite 8.0.1, vitest 4.1.0
- [@jtarrio/webrtlsdr GitHub](https://github.com/jtarrio/webrtlsdr) -- RTL2832U_Provider API, SampleBlock type, readSamples() interface
- [RTL-SDR Blog Gain Functions](https://deepwiki.com/rtlsdrblog/rtl-sdr-blog/6.3-gain-control-functions) -- R820T2 discrete gain steps: 29 values from 0.0 to 49.6 dB
- [WebUSB on Workers explainer](https://github.com/odejesush/webusb-on-workers/blob/master/EXPLAINER.md) -- Pattern: requestDevice() on window, getDevices() in worker

### Tertiary (LOW confidence)
- [Vite COOP/COEP HMR issue](https://github.com/vitejs/vite/issues/16536) -- May or may not be resolved in Vite 8; needs testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all package versions verified against npm registry on 2026-03-19. SvelteKit 2.55.0 peer dependency on Vite 8 confirmed. vite-plugin-wasm supports Vite 8.
- Architecture: HIGH -- WebUSB in workers confirmed via W3C spec. SharedArrayBuffer ring buffer pattern validated by ringbuf.js, Chrome AudioWorklet design patterns, and production browser SDR applications.
- Pitfalls: HIGH -- COOP/COEP requirements verified via official Chrome docs. USB device claim failures well-documented across WebUSB community. Sample drop patterns documented in RTL-SDR community.

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (30 days -- stable domain, all packages released)
