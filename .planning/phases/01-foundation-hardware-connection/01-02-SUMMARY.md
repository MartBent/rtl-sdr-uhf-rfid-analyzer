---
phase: 01-foundation-hardware-connection
plan: 02
subsystem: infra
tags: [webusb, rtl-sdr, web-worker, shared-array-buffer, ringbuf, webrtlsdr, message-channel]

# Dependency graph
requires:
  - phase: 01-foundation-hardware-connection/01
    provides: "SvelteKit SPA scaffold, typed worker messages, reactive state modules, feature detection"
provides:
  - USB Worker with RTL-SDR device access via @jtarrio/webrtlsdr in worker context
  - RTL-SDR device wrapper (findAndConnect, configure, readSamples, close)
  - SharedArrayBuffer SPSC ring buffer (4MB) via ringbuf.js for IQ sample transfer
  - DSP Worker skeleton that reads from ring buffer and reports stats
  - Worker bridge orchestrating worker lifecycle and MessageChannel communication
  - Typed WorkerBridge interface (connect, disconnect, configure, startCapture, stopCapture, destroy)
  - Direct USB-to-DSP MessageChannel bypassing main thread for high-bandwidth data
  - Surprise USB disconnect detection with automatic status updates
affects: [01-03, 02-spectrum-visualization, 03-epc-gen2-decoder, 04-timeline-analysis]

# Tech tracking
tech-stack:
  added: []
  patterns: [worker-bridge-pattern, message-channel-direct-worker-comm, ring-buffer-spsc, vite-import-meta-url-workers, usb-worker-getdevices-pattern]

key-files:
  created:
    - src/lib/usb/usb-types.ts
    - src/lib/usb/rtl-device.ts
    - src/lib/usb/usb-worker.ts
    - src/lib/dsp/ring-buffer.ts
    - src/lib/dsp/dsp-worker.ts
    - src/lib/workers/worker-bridge.ts
    - src/lib/workers/worker-bridge.test.ts
  modified: []

key-decisions:
  - "Used RTL2832U.open(usbDevice) directly instead of RTL2832U_Provider -- provider may call requestDevice() which is Window-only"
  - "USB Worker creates ring buffer on start-capture (not at worker init) -- allows multiple capture sessions with fresh buffers"
  - "DSP Worker receives MessagePort via set-usb-port message with transferable port -- enables direct USB-to-DSP without main thread"

patterns-established:
  - "Worker bridge pattern: createWorkerBridge() factory returns typed interface, encapsulates all worker communication"
  - "MessageChannel for direct worker-to-worker: USB Worker sends ring buffer SAB and capture state to DSP Worker via port"
  - "Ring buffer lifecycle: created per capture session in USB Worker, SharedArrayBuffer sent to DSP Worker via MessagePort"
  - "Surprise disconnect: navigator.usb disconnect event listener in USB Worker context"
  - "Stats throttling: workers report stats every 500ms via STATS_REPORT_INTERVAL_MS constant"

requirements-completed: [HW-01, HW-02, INFRA-03]

# Metrics
duration: 9min
completed: 2026-03-19
---

# Phase 1 Plan 2: Worker Architecture Summary

**Two-worker threading architecture with USB Worker (RTL-SDR via @jtarrio/webrtlsdr), DSP Worker skeleton, SharedArrayBuffer ring buffer (4MB ringbuf.js), and WorkerBridge with MessageChannel for direct worker-to-worker IQ data transfer**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-19T15:30:29Z
- **Completed:** 2026-03-19T15:40:01Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- USB Worker handles all 5 message types (connect, disconnect, configure, start-capture, stop-capture) with full error handling and surprise disconnect detection
- RTL-SDR device wrapper using @jtarrio/webrtlsdr RTL2832U.open() for worker-based WebUSB device access
- SharedArrayBuffer SPSC ring buffer (4MB, ~0.83s at 2.4 MSPS) via ringbuf.js with writer in USB Worker and reader in DSP Worker
- DSP Worker skeleton reads from ring buffer at 10ms polling interval, reports processed sample stats
- Worker bridge creates both workers, establishes MessageChannel for direct USB-to-DSP communication, and routes all status/stats messages to reactive Svelte 5 state
- 15 new worker-bridge tests (44 total tests passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: USB Worker with RTL-SDR device wrapper and ring buffer writer** - `aab85cf` (feat)
2. **Task 2: DSP Worker skeleton and Worker Bridge with message routing** - `74a3a40` (feat)

## Files Created/Modified
- `src/lib/usb/usb-types.ts` - RTL-SDR vendor/product IDs, ring buffer and transfer size constants
- `src/lib/usb/rtl-device.ts` - RTL-SDR device wrapper using @jtarrio/webrtlsdr RTL2832U
- `src/lib/usb/usb-worker.ts` - USB Worker entry point with capture loop and disconnect detection
- `src/lib/dsp/ring-buffer.ts` - ringbuf.js wrapper for SharedArrayBuffer SPSC ring buffer
- `src/lib/dsp/dsp-worker.ts` - DSP Worker skeleton with ring buffer polling loop
- `src/lib/workers/worker-bridge.ts` - Worker orchestration, MessageChannel, state routing
- `src/lib/workers/worker-bridge.test.ts` - 15 tests for bridge exports, patterns, and message handling

## Decisions Made
- **Used RTL2832U.open() directly instead of RTL2832U_Provider:** The Provider's get() method may internally call requestDevice() which is Window-only. Instead, we call navigator.usb.getDevices() in the worker to find the paired device, then pass it to RTL2832U.open(). This is the documented worker-compatible pattern.
- **Ring buffer created per capture session:** Rather than creating the ring buffer at worker initialization, it is created fresh on each start-capture message. This allows clean buffer state for each capture session and avoids stale data.
- **DSP Worker receives port via set-usb-port message with transferable:** The bridge creates a MessageChannel and transfers port1 to USB Worker and port2 to DSP Worker. This enables direct high-bandwidth communication without main thread involvement.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Worker bridge test initially used `toContain` with single-line string patterns that didn't match multi-line formatted source code. Fixed by switching to regex patterns with `toMatch` for the Vite worker URL assertions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Worker architecture complete and ready for Plan 01-03 (UI layout, connection controls, tuning panel)
- WorkerBridge interface is the single entry point for UI components to control the USB/DSP pipeline
- DSP Worker skeleton is ready for Phase 2 (FFT processing) and Phase 3 (EPC Gen2 demodulation)
- All 44 tests passing, build succeeds

---
*Phase: 01-foundation-hardware-connection*
*Completed: 2026-03-19*
