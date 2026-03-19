# Architecture Research

**Domain:** Browser-based SDR UHF RFID protocol analyzer
**Researched:** 2026-03-19
**Confidence:** MEDIUM-HIGH

## Standard Architecture

### System Overview

```
+=====================================================================+
|                         BROWSER (Main Thread)                        |
|                                                                      |
|  +-------------+   +----------------+   +-----------------------+    |
|  | UI Layer    |   | State Manager  |   | Visualization Engine |    |
|  | (Preact/    |   | (Reactive      |   | (Canvas/WebGL)       |    |
|  |  Solid/     |   |  Store)        |   |                      |    |
|  |  Vanilla)   |   |                |   | - Spectrum FFT plot   |    |
|  +------+------+   +-------+--------+   | - Waterfall display   |    |
|         |                  |             | - Protocol timeline   |    |
|         +--------+---------+             +-----------+-----------+    |
|                  |                                   |               |
|     ============ | MessagePort / SharedArrayBuffer   | ============  |
|                  |                                   |               |
+==================|===================================|===============+
                   |                                   |
  +================|===================================|=============+
  |                v                                   v             |
  |              DSP WORKER (Web Worker)                             |
  |                                                                  |
  |  +-------------+   +---------------+   +--------------------+   |
  |  | IQ Ingress  |   | Signal Chain  |   | Protocol Decoder   |   |
  |  | (Ring       |   | - DC removal  |   | - PIE demod        |   |
  |  |  Buffer)    +-->| - Filtering   +-->| - Symbol extract   |   |
  |  |             |   | - Envelope    |   | - Frame sync       |   |
  |  +------+------+   | - FFT (viz)   |   | - Gen2 parse       |   |
  |         ^          +---------------+   +--------------------+   |
  |         |                                                        |
  +=========|========================================================+
            |  ArrayBuffer transfer / SharedArrayBuffer
            |
  +==========|=======================================================+
  |          v                                                        |
  |        USB WORKER (Web Worker)                                    |
  |                                                                   |
  |  +----------------+   +------------------+   +----------------+  |
  |  | WebUSB Device  |   | RTL2832U Control |   | Sample Stream  |  |
  |  | Manager        +-->| (USB Control     +-->| (Bulk Transfer |  |
  |  | (enumerate,    |   |  Transfers for   |   |  EP 0x81,      |  |
  |  |  claim)        |   |  freq/gain/rate) |   |  async read)   |  |
  |  +----------------+   +------------------+   +----------------+  |
  |                                                                   |
  +===================================================================+
            |
            v
     [RTL-SDR V3/V4 USB Hardware]
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| USB Worker | WebUSB device management, RTL2832U register control, IQ sample bulk transfers | Dedicated Web Worker wrapping rtlsdrjs or custom WebUSB driver |
| DSP Worker | All signal processing: DC removal, filtering, envelope detection, FFT, PIE demodulation, Gen2 protocol decoding | Dedicated Web Worker; hot path in WASM if needed |
| State Manager | SDR connection state, tuning parameters, decoded message buffer, UI preferences | Reactive store (signals-based or pub/sub) on main thread |
| Visualization Engine | Spectrum plot, waterfall spectrogram, protocol timeline rendering | Canvas 2D for spectrum/timeline; Canvas 2D or WebGL for waterfall |
| UI Layer | Controls, status display, message list, settings | Lightweight framework or vanilla TypeScript with reactive bindings |

## Recommended Project Structure

```
src/
+-- usb/                    # USB layer
|   +-- usb-worker.ts       # Web Worker entry point
|   +-- rtl2832u.ts         # RTL2832U chip register control
|   +-- r820t2.ts           # R820T2 tuner control
|   +-- device.ts           # WebUSB device abstraction
|   +-- usb-types.ts        # USB message types, commands
+-- dsp/                    # DSP pipeline
|   +-- dsp-worker.ts       # Web Worker entry point
|   +-- pipeline.ts         # Signal chain orchestrator
|   +-- dc-removal.ts       # DC offset correction
|   +-- filter.ts           # Low-pass / bandpass filters
|   +-- envelope.ts         # AM envelope detection
|   +-- fft.ts              # FFT for spectrum display
|   +-- ring-buffer.ts      # SharedArrayBuffer ring buffer
+-- protocol/               # RFID protocol decoding
|   +-- pie-demod.ts        # PIE pulse interval demodulator
|   +-- symbol-extract.ts   # Symbol timing and extraction
|   +-- frame-sync.ts       # Preamble detection, frame alignment
|   +-- gen2-decoder.ts     # EPC Gen2 command parser
|   +-- gen2-types.ts       # Command types, parameter structures
|   +-- fm0-decoder.ts      # FM0 backscatter decoder (stretch)
+-- viz/                    # Visualization
|   +-- spectrum.ts         # Spectrum analyzer plot
|   +-- waterfall.ts        # Waterfall spectrogram display
|   +-- timeline.ts         # Protocol message timeline
|   +-- colormap.ts         # Waterfall color gradients
+-- state/                  # State management
|   +-- store.ts            # Central reactive store
|   +-- sdr-state.ts        # SDR connection and config state
|   +-- tuning-state.ts     # Frequency, gain, bandwidth
|   +-- messages-state.ts   # Decoded message ring buffer
+-- ui/                     # UI components
|   +-- app.ts              # Root application component
|   +-- controls.ts         # SDR controls panel
|   +-- status-bar.ts       # Connection status, sample rate
|   +-- message-list.ts     # Decoded message display
|   +-- region-presets.ts   # UHF RFID region selector
+-- workers/                # Worker bootstrap and message contracts
|   +-- worker-messages.ts  # Typed message definitions (all workers)
|   +-- worker-utils.ts     # Shared utilities for worker comms
+-- index.html              # Entry point
+-- main.ts                 # Application bootstrap
```

### Structure Rationale

- **usb/:** Isolated because WebUSB is inherently complex with low-level register access. Runs entirely inside a dedicated worker -- no direct main-thread coupling.
- **dsp/:** Separated from protocol/ because DSP primitives (filters, FFT, envelope) are generic and reusable. The DSP worker imports from both dsp/ and protocol/ but they are logically distinct.
- **protocol/:** Domain-specific EPC Gen2 logic isolated from generic DSP. This is where the RFID knowledge lives. Easiest module to unit test independently with sample data.
- **viz/:** Rendering code is performance-sensitive and benefits from being independent of UI framework choice. Canvas/WebGL code should not be mixed with DOM manipulation.
- **state/:** Central state decoupled from both workers and UI. Workers push data into the store; UI subscribes reactively. This prevents tight coupling between the processing pipeline and the presentation layer.
- **workers/:** Shared message type definitions ensure type safety across the worker boundary. Both USB and DSP workers import from here.

## Architectural Patterns

### Pattern 1: Dedicated Workers with Typed Message Passing

**What:** Each major subsystem (USB, DSP) runs in its own Web Worker. Communication uses structured messages with discriminated union types. Heavy data (IQ samples, FFT bins) uses ArrayBuffer transfer or SharedArrayBuffer to avoid copying.

**When to use:** Always for this application. USB I/O and DSP processing must not block the main thread or each other.

**Trade-offs:**
- Pro: UI stays responsive. USB and DSP run at their own cadence. Clean separation of concerns.
- Pro: If DSP falls behind, USB worker keeps streaming (drops handled explicitly).
- Con: Debugging is harder across worker boundaries. Message passing adds boilerplate.
- Con: SharedArrayBuffer requires cross-origin isolation headers (COOP/COEP).

**Example:**
```typescript
// workers/worker-messages.ts
type UsbToMainMessage =
  | { type: 'device-connected'; deviceInfo: DeviceInfo }
  | { type: 'device-disconnected' }
  | { type: 'error'; error: string };

type UsbToDspMessage =
  | { type: 'samples'; buffer: ArrayBuffer }; // transferred, not copied

type MainToUsbMessage =
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'set-frequency'; hz: number }
  | { type: 'set-gain'; gain: number }
  | { type: 'set-sample-rate'; rate: number };

type DspToMainMessage =
  | { type: 'fft-data'; bins: Float32Array }        // for spectrum/waterfall
  | { type: 'decoded-message'; message: Gen2Message } // for protocol timeline
  | { type: 'signal-stats'; stats: SignalStats };     // for status display
```

### Pattern 2: SharedArrayBuffer Ring Buffer for IQ Samples

**What:** A lock-free single-producer/single-consumer ring buffer backed by SharedArrayBuffer for streaming IQ samples from the USB worker to the DSP worker. Uses Atomics for synchronization. Avoids postMessage serialization overhead entirely for the hot path.

**When to use:** When sample throughput demands it. At 2.4 MSPS with 8-bit I/Q, that is 4.8 MB/s of data. postMessage with ArrayBuffer transfer works but adds GC pressure from repeated allocation. SharedArrayBuffer eliminates this.

**Trade-offs:**
- Pro: Zero-copy, zero-GC data path. 2.5-6x throughput improvement over postMessage per Chrome audio team benchmarks.
- Pro: Ring buffer naturally handles producer/consumer rate mismatch.
- Con: Requires COOP/COEP headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`).
- Con: More complex to implement correctly. Must handle overflow (producer faster than consumer) explicitly.

**Example:**
```typescript
// dsp/ring-buffer.ts
class IQRingBuffer {
  private buffer: SharedArrayBuffer;
  private state: Int32Array;    // [writeIndex, readIndex] via Atomics
  private data: Uint8Array;     // IQ samples view

  constructor(capacityBytes: number) {
    // 8 bytes for atomic state + sample data
    this.buffer = new SharedArrayBuffer(8 + capacityBytes);
    this.state = new Int32Array(this.buffer, 0, 2);
    this.data = new Uint8Array(this.buffer, 8);
  }

  // Producer (USB Worker) side
  write(samples: Uint8Array): number { /* lock-free write with Atomics */ }

  // Consumer (DSP Worker) side
  read(output: Uint8Array): number { /* lock-free read with Atomics */ }

  // Pass this.buffer to the other worker during init
  getSharedBuffer(): SharedArrayBuffer { return this.buffer; }
}
```

### Pattern 3: Pull-Based Visualization with requestAnimationFrame

**What:** The visualization layer does NOT render on every DSP output. Instead, it pulls the latest FFT/decoded data from a shared buffer on each animation frame (60fps or display refresh rate). This decouples DSP processing rate from rendering rate.

**When to use:** Always. DSP produces data at sample-rate-driven intervals (potentially hundreds of times per second for FFT). Rendering must not be driven by data arrival.

**Trade-offs:**
- Pro: Guaranteed smooth rendering at display refresh rate.
- Pro: If DSP produces faster than display can show, we just skip frames -- no backpressure to processing pipeline.
- Con: Latest-value semantics may miss brief transients in spectrum display.

**Example:**
```typescript
// viz/spectrum.ts
class SpectrumRenderer {
  private latestFftBins: Float32Array | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  onFftData(bins: Float32Array) {
    // Just store reference, don't render immediately
    this.latestFftBins = bins;
  }

  private renderLoop = () => {
    if (this.latestFftBins) {
      this.drawSpectrum(this.latestFftBins);
      this.latestFftBins = null;
    }
    requestAnimationFrame(this.renderLoop);
  };
}
```

### Pattern 4: Layered Protocol Decoding Pipeline

**What:** Protocol decoding is structured as a pipeline of stages: raw IQ -> envelope detection -> pulse measurement -> symbol extraction -> frame synchronization -> command decoding. Each stage has a clear input/output contract and can be tested independently.

**When to use:** Always for protocol decoders. Stages map directly to signal processing theory and EPC Gen2 spec sections.

**Trade-offs:**
- Pro: Each stage is independently testable with recorded data.
- Pro: Easy to add diagnostic taps (e.g., show envelope waveform, show detected pulses).
- Pro: Can swap implementations (e.g., WASM envelope detector) per stage.
- Con: Pipeline setup has some structural overhead.

## Data Flow

### Primary IQ Sample Flow

```
[RTL-SDR Hardware]
        |
        | USB Bulk Transfer (EP 0x81, 256KB chunks)
        v
[USB Worker]
  - readSamples() in async loop
  - Interleaved uint8 I/Q pairs
        |
        | SharedArrayBuffer ring buffer (zero-copy)
        | OR ArrayBuffer transfer via postMessage
        v
[DSP Worker]
  - Reads IQ chunks from ring buffer
  - Splits into processing blocks (e.g., 4096 samples)
        |
        +-----> [FFT Branch]
        |         - Window function (Hann/Blackman)
        |         - FFT (1024 or 2048 point)
        |         - Magnitude -> dB conversion
        |         - postMessage to main thread
        |                |
        |                v
        |       [Main Thread: Spectrum + Waterfall Renderer]
        |         - requestAnimationFrame loop
        |         - Canvas 2D or WebGL draw
        |
        +-----> [Demodulation Branch]
                  - DC removal (running average subtraction)
                  - Low-pass filter (match UHF RFID BW)
                  - Envelope detection (magnitude of complex signal)
                  - Pulse interval measurement (rising/falling edge detection)
                  - PIE symbol extraction (compare pulse width to Tari)
                  - Frame sync (detect preamble: fixed + Tari calibration)
                  - EPC Gen2 command parsing
                  - postMessage decoded message to main thread
                         |
                         v
                [Main Thread: Protocol Timeline + Message List]
                  - Append to message buffer
                  - Update timeline visualization
                  - Update decoded parameters display
```

### State Management Flow

```
[USB Worker] ---device-connected/disconnected---> [State Store]
[USB Worker] ---actual-frequency/gain/rate------> [State Store]
[DSP Worker] ---decoded-message------------------> [State Store]
[DSP Worker] ---fft-data------------------------> [Viz Engine] (direct, bypasses store)
[DSP Worker] ---signal-stats--------------------> [State Store]

[UI Controls] ---user-sets-frequency------------> [State Store] ---> [USB Worker]
[UI Controls] ---user-sets-gain-----------------> [State Store] ---> [USB Worker]
[UI Controls] ---user-connects/disconnects------> [State Store] ---> [USB Worker]

[State Store] ---subscribe----------------------> [UI Components] (reactive updates)
```

### Key Data Flows

1. **IQ Hot Path (USB -> DSP):** Highest throughput path. 4.8 MB/s at 2.4 MSPS. Must be zero-copy or transfer-based. Cannot go through main thread.
2. **FFT Visualization (DSP -> Main -> Canvas):** ~30-60 updates/sec of Float32Array FFT bins. PostMessage with transfer is fine here -- array sizes are small (1024-4096 floats).
3. **Decoded Messages (DSP -> Main -> UI):** Low frequency (hundreds per second at most). Small structured objects. Normal postMessage is fine.
4. **Control Commands (Main -> USB Worker):** Very low frequency (user interactions). Normal postMessage.

## Scaling Considerations

This is a single-user desktop browser tool, so "scaling" means handling increasing data throughput and computational load within the browser.

| Concern | At 0.9 MSPS | At 2.4 MSPS | At 3.2 MSPS (max) |
|---------|-------------|-------------|-------------------|
| USB throughput | 1.8 MB/s, easy | 4.8 MB/s, manageable | 6.4 MB/s, near limit |
| DSP load | JavaScript FFT + demod fine | May need WASM for demod | WASM likely needed |
| Memory pressure | Minimal | Ring buffer sizing matters | Must avoid GC pauses |
| FFT frame rate | Comfortable 60fps | 30fps realistic | May need to reduce FFT rate |

### Scaling Priorities

1. **First bottleneck: DSP Worker CPU saturation.** Envelope detection + PIE demodulation on every sample is the hot path. If JavaScript is too slow, move envelope detection and correlation to WebAssembly. FFT is the second candidate for WASM (well-known WASM FFT libraries exist).
2. **Second bottleneck: USB bulk transfer keeping up.** WebUSB bulk transfers are not as optimized as native libusb. If drops occur, increase read buffer sizes and reduce processing batch sizes to keep the USB pipeline fed.
3. **Third bottleneck: Visualization frame drops.** Waterfall rendering with many pixel rows can slow down. Solution: reduce waterfall update rate, use WebGL for texture-based waterfall, or use OffscreenCanvas in a third worker.

## Anti-Patterns

### Anti-Pattern 1: Processing IQ Samples on Main Thread

**What people do:** Read USB samples and run DSP in the main thread, assuming it is "fast enough."
**Why it is wrong:** At 2.4 MSPS, you have ~0.4ms per 1024-sample block. Any main thread work (DOM updates, event handling, GC) causes sample drops. The UI freezes during heavy processing.
**Do this instead:** All USB I/O and DSP processing in dedicated Web Workers. Main thread only handles UI rendering and state management.

### Anti-Pattern 2: PostMessage for Every IQ Buffer

**What people do:** Use `postMessage(buffer, [buffer])` with ArrayBuffer transfer for every USB read (every ~40ms at default 256KB buffer size).
**Why it is wrong:** Each transfer creates a new ArrayBuffer on the receiving side, leading to GC pressure. At 25 messages/sec with 256KB each, you create and discard 6.4MB/s of ArrayBuffer objects.
**Do this instead:** Use a SharedArrayBuffer ring buffer between USB and DSP workers. Allocate once, write/read forever. Reserve postMessage-with-transfer as a fallback if SharedArrayBuffer is unavailable.

### Anti-Pattern 3: Rendering on Data Arrival

**What people do:** Call canvas draw operations directly in the message handler when FFT data arrives from the DSP worker.
**Why it is wrong:** DSP may produce data faster than the display refresh rate, causing wasted GPU work. Or data may arrive at irregular intervals, causing stuttering.
**Do this instead:** Store latest data in a buffer. Render only inside requestAnimationFrame. This naturally throttles to display refresh rate.

### Anti-Pattern 4: Monolithic DSP Pipeline

**What people do:** Write one large function that takes raw IQ samples and outputs decoded messages, with all intermediate steps inlined.
**Why it is wrong:** Impossible to test individual stages. Cannot visualize intermediate signals for debugging (e.g., "is the envelope detector working?"). Cannot swap implementations.
**Do this instead:** Each DSP stage is a separate module with a defined input/output. Chain them together in a pipeline orchestrator. Add optional "tap" points that can emit intermediate data for visualization.

### Anti-Pattern 5: Storing All Decoded Messages in Memory

**What people do:** Push every decoded message into an ever-growing array.
**Why it is wrong:** In a long debugging session (hours), this can consume hundreds of MB. UHF RFID readers transmit commands continuously.
**Do this instead:** Use a fixed-size ring buffer for decoded messages (e.g., last 10,000 messages). Older messages are discarded. If session export is needed later (v2), write to IndexedDB or offer live export.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| WebUSB API | `navigator.usb.requestDevice()` with vendor/product filter for RTL2832U | Requires user gesture to trigger device selection. HTTPS required. |
| SharedArrayBuffer | `new SharedArrayBuffer(size)` shared via worker `postMessage` | Requires COOP/COEP headers. No known conflict with WebUSB in Chromium. |
| Canvas 2D / WebGL | Standard rendering APIs | WebGL preferred for waterfall (texture upload). Canvas 2D fine for spectrum/timeline. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Main Thread <-> USB Worker | postMessage (commands), postMessage (status) | Low frequency. Typed discriminated unions. |
| USB Worker <-> DSP Worker | SharedArrayBuffer ring buffer (IQ data) | High frequency hot path. Lock-free SPSC pattern. Workers can communicate directly via MessageChannel. |
| DSP Worker <-> Main Thread | postMessage with transfer (FFT bins), postMessage (decoded messages) | FFT data at ~30-60/sec, messages at protocol rate. |
| State Store <-> UI Components | Reactive subscriptions (signals/observables) | Synchronous within main thread. Fine-grained updates only. |
| State Store <-> Workers | postMessage (bidirectional for config changes) | Store dispatches config to USB worker. Workers push status/data to store. |

### Cross-Origin Isolation

SharedArrayBuffer requires these HTTP response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

For local development, Vite can serve these headers easily. For deployment on platforms that do not support custom headers (e.g., GitHub Pages), use the `coi-serviceworker` library as a polyfill.

**WebUSB + SharedArrayBuffer compatibility:** Both are Chromium-only features. No known conflicts between cross-origin isolation and WebUSB as of March 2026. Both require HTTPS (or localhost).

## Build Order (Dependency Sequence)

The following order respects component dependencies. Each phase produces a testable, demonstrable artifact.

```
Phase 1: USB Foundation
  - WebUSB device enumeration, connection, RTL2832U register control
  - Basic IQ sample reading (main thread first, worker second)
  - Verify: can connect to dongle and read raw bytes

Phase 2: DSP Worker + FFT Visualization
  - Web Worker infrastructure, message passing
  - IQ ingestion, FFT computation
  - Spectrum plot (Canvas 2D)
  - Verify: live spectrum display from RTL-SDR

Phase 3: Waterfall Display
  - Waterfall renderer (Canvas 2D, upgrade to WebGL if needed)
  - FFT data history management
  - Color mapping, zoom, frequency axis
  - Verify: waterfall shows RF activity over time

Phase 4: RFID Signal Demodulation
  - DC removal, filtering, envelope detection
  - PIE pulse interval measurement
  - Symbol extraction using Tari timing
  - Verify: can detect and measure pulses from RFID reader

Phase 5: Protocol Decoding + Timeline
  - Preamble/frame sync detection
  - EPC Gen2 command parser (Query, ACK, Select, etc.)
  - Protocol timeline visualization
  - Message list with decoded parameters
  - Verify: decoded RFID commands visible in UI

Phase 6: Performance Optimization
  - SharedArrayBuffer ring buffer (replace postMessage)
  - WASM hot path (envelope detection, FFT) if needed
  - OffscreenCanvas for waterfall if needed
  - Verify: stable at 2.4 MSPS without drops

Phase 7: Backscatter Decoding (Stretch)
  - FM0/Miller demodulation for tag responses
  - Correlation-based detection of weak backscatter
  - Verify: tag responses visible alongside reader commands
```

**Phase ordering rationale:**
- USB must come first (everything depends on samples).
- FFT/spectrum comes before protocol decoding because it provides visual confirmation the hardware works and signals are present -- essential for debugging subsequent stages.
- Waterfall before protocol decoding because it helps identify RFID signals visually before writing the demodulator.
- Protocol decoding depends on both the DSP pipeline (Phase 2) and understanding signal characteristics visible in spectrum/waterfall (Phases 2-3).
- Performance optimization deferred because correctness first; the system should work with postMessage before optimizing to SharedArrayBuffer.

## Sources

- [rtlsdrjs - WebUSB RTL-SDR library](https://github.com/sandeepmistry/rtlsdrjs) -- LOW-level USB API for RTL2832U in browser
- [webrtlsdr - Full reception/demodulation pipeline](https://github.com/jtarrio/webrtlsdr) -- TypeScript RTL-SDR library with Radio/Demodulator
- [Radio Receiver - Browser SDR application](https://github.com/jtarrio/radioreceiver) -- Reference browser SDR architecture
- [ringbuf.js - SPSC ring buffer for SharedArrayBuffer](https://github.com/padenot/ringbuf.js) -- Lock-free ring buffer pattern
- [Chrome AudioWorklet SharedArrayBuffer design pattern](https://googlechromelabs.github.io/web-audio-samples/audio-worklet/design-pattern/shared-buffer/) -- SharedArrayBuffer + Worker threading model
- [OpenWebRX Waterfall Display architecture](https://deepwiki.com/jketterl/openwebrx/2.2-waterfall-display) -- Canvas-based waterfall rendering approach
- [RTL-SDR async streaming internals](https://deepwiki.com/rtlsdrblog/rtl-sdr-blog/3.4-asynchronous-data-streaming) -- Buffer sizes, transfer pipeline details
- [Gen2 UHF RFID Reader (GNU Radio)](https://github.com/nkargas/Gen2-UHF-RFID-Reader) -- Gate->Decoder->Reader signal processing chain
- [OffscreenCanvas for worker rendering](https://web.dev/articles/offscreen-canvas) -- Moving canvas rendering off main thread
- [Cross-origin isolation guide](https://web.dev/articles/coop-coep) -- COOP/COEP headers for SharedArrayBuffer
- [EPC Gen2 Standard](https://ref.gs1.org/standards/gen2/) -- Official UHF RFID protocol specification
- [Simple Low Cost Open Source UHF RFID Reader](https://hal.science/hal-04009076v1/document) -- SDR-based RFID reader architecture reference

---
*Architecture research for: Browser-based UHF RFID protocol analyzer*
*Researched: 2026-03-19*
