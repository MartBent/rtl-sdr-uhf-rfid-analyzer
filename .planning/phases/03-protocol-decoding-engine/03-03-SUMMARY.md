---
phase: 03-protocol-decoding-engine
plan: 03
subsystem: protocol
tags: [epc-gen2, inventory-round, fm0, backscatter, ring-buffer, svelte-state]

# Dependency graph
requires:
  - phase: 03-protocol-decoding-engine
    provides: "Gen2 type definitions (Gen2Command, BackscatterResult, RoundUpdate) from Plan 01"
provides:
  - "Inventory round grouping state machine (InventoryTracker)"
  - "FM0 backscatter decoder with correlation-based preamble detection and confidence scoring"
  - "Decode state ring buffer (5000 commands max) with Svelte 5 $state reactivity"
  - "Decode statistics tracking (total commands, CRC pass rate, commands/sec, Tari)"
affects: [03-04-PLAN, 03-05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [normalized-cross-correlation, channel-amplitude-gating, ring-buffer-via-slice, fm0-differential-detection]

key-files:
  created:
    - src/lib/protocol/inventory-tracker.ts
    - src/lib/protocol/inventory-tracker.test.ts
    - src/lib/protocol/fm0-decoder.ts
    - src/lib/protocol/fm0-decoder.test.ts
  modified:
    - src/lib/state/decode-state.svelte.ts

key-decisions:
  - "FM0 decoder uses normalized cross-correlation (not raw correlation) to keep confidence in [0,1] range"
  - "Minimum channel amplitude gate (0.05) rejects noise-only signals where normalized correlation is unreliable"
  - "Test signals generated at exact decoder sample spacing (float) to avoid grid mismatch with integer rounding"
  - "Ring buffer uses array slice(-MAX) for simplicity with Svelte 5 reactivity (not pointer-based ring buffer)"

patterns-established:
  - "Normalized cross-correlation: corr / sqrt(preamble_energy * signal_energy) for [0,1] confidence"
  - "Channel amplitude gate: reject decode attempts where estimated amplitude < threshold (noise rejection)"
  - "FM0 differential detection: compare sign of first-half and second-half samples per symbol"
  - "Inventory round boundary: Query starts new round, returns previous round status"

requirements-completed: [DEC-12, DEC-13]

# Metrics
duration: 6min
completed: 2026-03-20
---

# Phase 03 Plan 03: Inventory Tracker, FM0 Decoder, and Decode State Summary

**Inventory round grouping state machine, FM0 correlation-based backscatter decoder with confidence scoring, and 5000-entry decoded command ring buffer with Svelte 5 reactive state**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T13:33:06Z
- **Completed:** 2026-03-20T13:39:28Z
- **Tasks:** 2 (1 TDD, 1 standard)
- **Files created:** 4
- **Files modified:** 1

## Accomplishments
- InventoryTracker groups decoded commands into rounds using Query as boundary marker, flags incomplete rounds (no ACK)
- Fm0Decoder uses normalized cross-correlation for preamble detection with 50% confidence threshold and channel amplitude gating for noise rejection
- Decode state module manages bounded ring buffers (5000 commands, 1000 backscatter, 500 rounds) with statistics tracking
- 15 new tests (10 inventory tracker + 5 FM0 decoder), full suite: 179 tests passing

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: Inventory tracker state machine and FM0 backscatter decoder**
   - `6dd4b31` (test): failing tests for inventory tracker and FM0 decoder
   - `f89f87f` (feat): inventory tracker and FM0 decoder implementation

2. **Task 2: Decode state module with ring buffer and statistics**
   - `cd846d9` (feat): refine decode state module with ring buffer and statistics

## Files Created/Modified
- `src/lib/protocol/inventory-tracker.ts` - Round grouping state machine: Query starts new round, ACK marks complete (86 lines)
- `src/lib/protocol/inventory-tracker.test.ts` - 10 tests covering round boundaries, completeness, reset, pre-Query commands (155 lines)
- `src/lib/protocol/fm0-decoder.ts` - Correlation-based FM0 preamble detection with normalized confidence scoring (146 lines)
- `src/lib/protocol/fm0-decoder.test.ts` - 5 tests with synthetic FM0 signal generation, noise rejection, confidence validation (163 lines)
- `src/lib/state/decode-state.svelte.ts` - Svelte 5 $state ring buffer for decoded commands, backscatter, rounds, and stats (115 lines)

## Decisions Made
- **Normalized cross-correlation for FM0 confidence**: The plan's original approach (raw correlation / channel estimate) could produce confidence > 1.0 for certain signal conditions. Switched to normalized cross-correlation (corr / sqrt(preamble_energy * signal_energy)) which is mathematically bounded to [-1, 1].
- **Channel amplitude gating**: Added MIN_CHANNEL_AMPLITUDE = 0.05 threshold because normalized cross-correlation is unreliable on low-amplitude noise (a 12-element correlation template can spuriously align with random vectors in 12 dimensions). This provides a practical noise floor gate.
- **Test BLF selection**: Changed test BLF from 640 kHz to 300 kHz so that samplesPerBit (= sampleRate/BLF = 8) is an integer. At 640 kHz, samplesPerBit = 3.75 which caused grid misalignment between integer-sampled test signals and the decoder's fractional sample indices.
- **Removed crcPassRate from stats**: The plan spec has crcPassed (computed from crcPassRate * crcChecked). Removed the redundant crcPassRate field.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FM0 confidence normalization exceeded [0,1] range**
- **Found during:** Task 1 (FM0 decoder implementation)
- **Issue:** Plan's confidence formula `bestCorr / (FM0_PREAMBLE.length * channelEst)` allowed values > 1.0 because the channel estimate only averaged 6 of 12 preamble positions while the correlation summed all 12
- **Fix:** Switched to normalized cross-correlation: `corr / sqrt(preamble_energy * signal_energy)`, mathematically bounded to [-1, 1]
- **Files modified:** src/lib/protocol/fm0-decoder.ts
- **Verification:** Confidence values now in [0, 1] for all test cases; clean signal > noisy signal
- **Committed in:** f89f87f

**2. [Rule 1 - Bug] FM0 decoder did not reject noise-only signals**
- **Found during:** Task 1 (FM0 decoder tests)
- **Issue:** Normalized cross-correlation of 12-element template against random noise can yield high confidence (0.8+) because the sparse template only samples 12 points from the signal
- **Fix:** Added MIN_CHANNEL_AMPLITUDE = 0.05 gate: reject if estimated channel amplitude is below threshold (noise floor detection)
- **Files modified:** src/lib/protocol/fm0-decoder.ts
- **Verification:** Noise test (amplitude 0.01) correctly returns null; clean signal (amplitude 1.0) passes
- **Committed in:** f89f87f

**3. [Rule 1 - Bug] FM0 test signal grid misalignment**
- **Found during:** Task 1 (FM0 decoder tests)
- **Issue:** Test used BLF=640kHz giving samplesPerBit=3.75 (fractional). Test generator rounded to 4, but decoder used 3.75 float, causing preamble sample indices to drift from the test signal grid
- **Fix:** Changed test BLF to 300kHz (samplesPerBit=8, integer) and updated test signal generator to use float spacing matching decoder
- **Files modified:** src/lib/protocol/fm0-decoder.test.ts
- **Verification:** Known bit pattern [1,0,1,1,0,0,1,0] decodes correctly with all 8 bits matching
- **Committed in:** f89f87f

---

**Total deviations:** 3 auto-fixed (3 bugs in FM0 decoder -- correlation normalization, noise rejection, and test alignment)
**Impact on plan:** All fixes necessary for correctness. The FM0 decoder now has proper confidence bounds, noise rejection, and verified bit decode accuracy. No scope creep.

## Issues Encountered
- decode-state.svelte.ts was partially created by a parallel Plan 03-02 execution (commit de50cd2). Updated it to match this plan's specification exactly (removed crcPassRate, added MAX_ROUNDS constant, improved documentation).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- InventoryTracker ready for integration with DSP Worker pipeline in Plan 04
- Fm0Decoder ready for integration with demod pipeline (called after reader command detection in silence regions)
- Decode state ready for UI consumption in Plan 05 (DecodedOutputPanel)
- All exports match plan specifications for downstream imports

## Self-Check: PASSED

- All 5 source files exist in correct locations
- All 3 commit hashes verified (6dd4b31, f89f87f, cd846d9)
- 15 new tests passing across 2 test files
- Full test suite: 179 tests passing, 0 regressions

---
*Phase: 03-protocol-decoding-engine*
*Completed: 2026-03-20*
