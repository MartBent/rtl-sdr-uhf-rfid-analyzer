---
phase: 03-protocol-decoding-engine
plan: 01
subsystem: protocol
tags: [epc-gen2, crc, parser, frame-sync, typescript, vitest]

# Dependency graph
requires:
  - phase: 02-rf-visualization-ui
    provides: "DSP Worker architecture and test patterns"
provides:
  - "Gen2 type definitions (Gen2Command, Gen2CommandType, DemodSymbol, FrameSyncResult)"
  - "CRC-5 and CRC-16/GENIBUS bit-level validation"
  - "Gen2 command parser for all 7 reader command types"
  - "Frame-sync/preamble detector with adaptive Tari extraction"
affects: [03-02-PLAN, 03-03-PLAN, 03-04-PLAN, 03-05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [bit-level-crc, ebv-decoding, adaptive-tari, prefix-matching-decoder]

key-files:
  created:
    - src/lib/protocol/gen2-types.ts
    - src/lib/protocol/gen2-crc.ts
    - src/lib/protocol/gen2-crc.test.ts
    - src/lib/protocol/gen2-decoder.ts
    - src/lib/protocol/gen2-decoder.test.ts
    - src/lib/protocol/frame-sync.ts
    - src/lib/protocol/frame-sync.test.ts
  modified: []

key-decisions:
  - "CRC bit-level algorithm uses MSB-XOR (not LSB-shift-in) to match standard byte-level CRC behavior"
  - "CRC-16 validation checks residue 0xE2F0 (= 0x1D0F ^ 0xFFFF) since crc16() applies XOR-out"
  - "EBV uses 8-bit octets (1 continuation + 7 value bits) per Gen2 spec, not 7-bit chunks"
  - "identifyCommand checks 8-bit codes before 4-bit before 2-bit to prevent prefix ambiguity"

patterns-established:
  - "Bit-level CRC: XOR input bit into MSB, then conditional shift+XOR with polynomial"
  - "Command prefix matching: longest prefix first to resolve ambiguity between variable-length codes"
  - "Frame sync detection: delimiter tolerance +/-20%, pivot = RTcal/2, TRcal > RTcal indicates preamble"
  - "EBV decoding: 8-bit octets with MSB continuation bit, 7 value bits per octet, big-endian assembly"

requirements-completed: [DEC-02, DEC-03, DEC-04, DEC-05, DEC-06, DEC-07, DEC-08, DEC-09, DEC-10, DEC-11]

# Metrics
duration: 10min
completed: 2026-03-20
---

# Phase 03 Plan 01: Protocol Types, CRC, Command Parser, and Frame Sync Summary

**Bit-level CRC-5/CRC-16 validation, all 7 Gen2 command parsers with parameter extraction, and adaptive frame-sync detector with ratio-based symbol classification**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-20T13:18:55Z
- **Completed:** 2026-03-20T13:29:30Z
- **Tasks:** 2 (both TDD)
- **Files created:** 7
- **Tests:** 55 passing (10 CRC + 12 frame-sync + 33 decoder)

## Accomplishments
- CRC-5 and CRC-16/GENIBUS validation with correct bit-level algorithms verified against standard test vectors
- All 7 Gen2 reader command types (Query, QueryRep, QueryAdjust, ACK, NAK, Select, ReqRN) decode with typed parameters
- Select command handles variable-length mask field via EBV pointer decoding
- FrameSyncDetector distinguishes preamble from frame-sync, extracts Tari adaptively, computes pivot = RTcal/2
- Full type system for protocol pipeline: Gen2Command, DemodSymbol, FrameSyncResult, BackscatterResult, DecodedCommandMsg

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: Gen2 types, CRC-5/CRC-16, frame-sync detector**
   - `8ec4c1d` (test): failing tests for CRC and frame-sync
   - `4c812ba` (feat): CRC implementation and frame-sync detector

2. **Task 2: Gen2 command parser for all 7 types**
   - `7220bfd` (test): failing tests for Gen2 decoder (all 7 types)
   - `225ccf4` (feat): Gen2 command parser implementation

## Files Created/Modified
- `src/lib/protocol/gen2-types.ts` - Type definitions for all Gen2 commands, parameters, symbols, and messages (118 lines)
- `src/lib/protocol/gen2-crc.ts` - CRC-5 and CRC-16/GENIBUS bit-level validation (74 lines)
- `src/lib/protocol/gen2-crc.test.ts` - 10 CRC tests covering compute, validate, reject, non-byte-aligned (164 lines)
- `src/lib/protocol/gen2-decoder.ts` - Bit stream to Gen2 command parser with EBV and prefix matching (291 lines)
- `src/lib/protocol/gen2-decoder.test.ts` - 33 decoder tests for all 7 types plus edge cases (475 lines)
- `src/lib/protocol/frame-sync.ts` - Preamble/frame-sync detection with adaptive Tari (118 lines)
- `src/lib/protocol/frame-sync.test.ts` - 12 frame-sync tests for Tari 12.5/25us, delimiter tolerance, classification (241 lines)

## Decisions Made
- **CRC bit-level algorithm corrected**: The plan's code example used shift-in-LSB for the CRC computation, but the correct bit-level algorithm XORs each input bit into the MSB position then shifts. This matches the standard byte-level CRC behavior when decomposed to individual bits. Verified against CRC-16/GENIBUS check value 0xD64E for "123456789".
- **CRC-16 validation residue**: The CRC-16/GENIBUS residue is 0x1D0F in the raw register. Since `crc16()` applies XOR-out (^0xFFFF), `validateCrc16` checks against 0xE2F0 (= 0x1D0F ^ 0xFFFF).
- **EBV uses 8-bit octets**: The plan's examples used 7-bit EBV chunks (1+6), but the Gen2 spec defines EBV as 8-bit octets (1 continuation + 7 value bits). Fixed to match spec.
- **identifyCommand priority**: 8-bit codes (NAK, ReqRN) checked before 4-bit (Query, QueryAdjust, Select) before 2-bit (QueryRep, ACK) to prevent prefix collisions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CRC bit-level algorithm was incorrect**
- **Found during:** Task 1 (CRC implementation)
- **Issue:** Plan's code example used `crc = ((crc << 1) | bit)` (shift bit into LSB), which produces different results than the standard CRC algorithm
- **Fix:** Changed to `crc ^= (bit << MSB_position)` followed by conditional shift+XOR, matching the canonical byte-level CRC decomposed to bits
- **Files modified:** src/lib/protocol/gen2-crc.ts
- **Verification:** CRC-16/GENIBUS check value 0xD64E for "123456789" matches reference; all validate/reject tests pass
- **Committed in:** 4c812ba

**2. [Rule 1 - Bug] EBV decoding used 6-bit value chunks instead of 7-bit**
- **Found during:** Task 2 (Select command decoding)
- **Issue:** EBV implementation used 7-bit chunks (1 cont + 6 value) instead of Gen2 spec's 8-bit octets (1 cont + 7 value)
- **Fix:** Changed decodeEBV to use 8-bit octets with 7 value bits; updated test data to use correct 8-bit EBV format
- **Files modified:** src/lib/protocol/gen2-decoder.ts, src/lib/protocol/gen2-decoder.test.ts
- **Verification:** Multi-byte EBV pointer test decodes value 130 = (1 << 7) | 2 correctly
- **Committed in:** 225ccf4

**3. [Rule 1 - Bug] Frame-sync TRcal test vector too small for Tari=25us**
- **Found during:** Task 1 (frame-sync tests)
- **Issue:** Test used TRCAL=120 which is smaller than RTCAL_25US=150 at Tari=25us, causing incorrect frame-sync classification
- **Fix:** Used TRCAL_25US=240 (> RTCAL_25US) for the 25us preamble test
- **Files modified:** src/lib/protocol/frame-sync.test.ts
- **Verification:** Preamble at Tari=25us correctly detected with proper Tari and pivot values
- **Committed in:** 4c812ba

---

**Total deviations:** 3 auto-fixed (3 bugs -- all from plan's code examples being slightly incorrect)
**Impact on plan:** All fixes were corrections to ensure protocol spec compliance. No scope creep.

## Issues Encountered
- Parallel execution of 03-02 plan captured some 03-01 files in its commit (4c812ba includes both gen2-crc.ts and demod-processor.ts). This is cosmetic -- all files are correctly committed and tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Protocol types (gen2-types.ts) ready for import by Plan 02 (WASM demod), Plan 03 (inventory tracker), Plan 04 (UI)
- CRC functions ready for import by gen2-decoder.ts (already integrated) and future command verification
- Frame-sync detector ready for integration with WASM demod output in Plan 02
- Command parser ready for end-to-end integration in Plan 03

## Self-Check: PASSED

- All 7 protocol files exist in src/lib/protocol/
- All 4 commit hashes verified (8ec4c1d, 4c812ba, 7220bfd, 225ccf4)
- 55 tests passing across 3 test files
- Full test suite: 164 tests passing, 0 regressions

---
*Phase: 03-protocol-decoding-engine*
*Completed: 2026-03-20*
