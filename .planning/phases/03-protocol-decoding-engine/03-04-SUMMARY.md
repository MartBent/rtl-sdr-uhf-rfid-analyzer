---
phase: 03-protocol-decoding-engine
plan: 04
subsystem: dsp
tags: [wasm, demod, worker, protocol, gen2, pie, fft]

# Dependency graph
requires:
  - phase: 03-protocol-decoding-engine (plan 01)
    provides: Protocol types, frame sync, command decoder
  - phase: 03-protocol-decoding-engine (plan 02)
    provides: WASM demod processor wrapper
  - phase: 03-protocol-decoding-engine (plan 03)
    provides: Inventory tracker, decode state module
provides:
  - Dual-path DSP Worker processing (FFT + demod in same poll loop)
  - Decoded command message types in worker protocol
  - Worker bridge routing for decoded data to UI state
  - End-to-end IQ -> decoded Gen2 command pipeline
affects: [04-timeline-visualization]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-path processing: FFT and demod in same read loop"
    - "Async WASM init with null-gate pattern for demod processing"
    - "Batched message delivery (100ms interval) for decoded commands"

key-files:
  created: []
  modified:
    - src/lib/workers/worker-messages.ts
    - src/lib/dsp/dsp-worker.ts
    - src/lib/workers/worker-bridge.ts

key-decisions:
  - "Demod path processes same IQ buffer as FFT path in single read loop (no data duplication)"
  - "WASM init is async; demod processing gated on null-check until init completes"
  - "Decoded commands batched at 100ms intervals to avoid message overhead"
  - "Inventory tracker runs in DSP Worker, not main thread"
  - "Worker bridge maps DecodedCommandMsg to Gen2Command with roundId=0 placeholder"

patterns-established:
  - "Dual-path processing: FFT and demod share the same ring buffer read loop"
  - "Async WASM init with null-gate: demodProcessor set after async init resolves"

requirements-completed: [DEC-01, DEC-11]

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 03 Plan 04: Worker Integration Summary

**Dual-path DSP Worker with WASM demod pipeline, extended message types, and bridge routing for decoded Gen2 commands**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T13:33:06Z
- **Completed:** 2026-03-20T13:38:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extended DspToMainMessage with decoded-commands and decode-stats message types
- DSP Worker processes IQ data through both FFT and demod paths in the same polling loop
- WASM demod initializes async on capture-started; disposes on capture-stopped
- Worker bridge routes decoded commands to decode state and optional callback
- Decode stats (total commands, CRC pass rate, commands/sec, Tari) sent alongside dsp-stats

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend worker messages with decoded data types** - `846b6d1` (feat)
2. **Task 2: DSP Worker dual-path processing and worker bridge routing** - `ca88b16` (feat)

## Files Created/Modified
- `src/lib/workers/worker-messages.ts` - Added decoded-commands and decode-stats message variants to DspToMainMessage union
- `src/lib/dsp/dsp-worker.ts` - Added demod processing pipeline (imports, state vars, processDemodData function, capture lifecycle)
- `src/lib/workers/worker-bridge.ts` - Routes decoded-commands and decode-stats, manages decode active state, added onDecodedData callback

## Decisions Made
- Demod path processes same buffer as FFT (no separate read or data copy) for zero-overhead dual processing
- WASM init is async with null-gate: `demodProcessor` starts null, set after `dp.init().then()` resolves, checked before every `processDemodData` call
- Decoded commands batched at 100ms intervals to reduce postMessage overhead while keeping UI responsive
- Inventory tracker runs inside DSP Worker (not main thread) to keep command grouping close to decode
- Worker bridge maps DecodedCommandMsg to Gen2Command with roundId=0 placeholder since actual roundId is managed by tracker in worker

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created missing decode-state.svelte.ts dependency**
- **Found during:** Task 2 (DSP Worker and bridge modifications)
- **Issue:** Plan 03-03 was partially executed; decode-state.svelte.ts was never created but is imported by worker-bridge.ts
- **Fix:** Created src/lib/state/decode-state.svelte.ts following established Svelte 5 $state pattern with ring buffer (5000 cap), decode stats, and exported setter functions
- **Files modified:** src/lib/state/decode-state.svelte.ts (new)
- **Verification:** All 16 passing test suites continue to pass; worker-bridge imports resolve correctly
- **Committed in:** de50cd2

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for plan completion. decode-state.svelte.ts was specified in plan 03-03 but not committed. No scope creep.

## Issues Encountered
- Pre-existing fm0-decoder.test.ts failure (noise rejection test) from incomplete plan 03-03 execution. Logged to deferred-items.md. Not caused by plan 03-04 changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full IQ -> decoded Gen2 command pipeline is operational
- Plan 03-05 (UI components for decoded data display) can consume decodeState and onDecodedData callback
- Phase 04 (timeline visualization) has all decoded command data available via worker bridge

## Self-Check: PASSED

All files verified present. All commits verified in git log.

---
*Phase: 03-protocol-decoding-engine*
*Completed: 2026-03-20*
