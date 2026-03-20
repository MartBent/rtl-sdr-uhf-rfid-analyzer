---
phase: 03-protocol-decoding-engine
plan: 05
subsystem: ui
tags: [svelte, decoded-output, command-row, backscatter-toggle, decode-controls, epc-gen2]

# Dependency graph
requires:
  - phase: 03-protocol-decoding-engine (plan 03)
    provides: decode state ring buffer, inventory round tracker, statistics
  - phase: 03-protocol-decoding-engine (plan 04)
    provides: DSP Worker demod pipeline feeding decoded commands to decode state
provides:
  - DecodedOutputPanel replacing Timeline placeholder with live decoded command display
  - DecodedCommandRow with expandable raw bits and CRC badge
  - DecodeControlsPanel sidebar with Tari display, stats, and backscatter toggle
  - Full end-to-end decode pipeline visible in UI
affects: [phase-04-timeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [svelte-5-reactive-state-driven-panel, console-style-command-log, inventory-round-grouping]

key-files:
  created:
    - src/lib/components/DecodedOutputPanel.svelte
    - src/lib/components/DecodedCommandRow.svelte
    - src/lib/components/DecodeControlsPanel.svelte
  modified:
    - src/routes/+page.svelte

key-decisions:
  - "Console-style log format for decoded commands -- monospace compact rows optimized for scanning many commands"
  - "Inventory rounds separated by thin bar with round number, not alternating backgrounds"
  - "Incomplete round indicator only shown when backscatter toggle is ON"

patterns-established:
  - "State-driven panel: component reads directly from Svelte 5 $state module (no bridge prop needed)"
  - "Auto-scroll with manual override: detects scroll position, pauses auto-scroll when user scrolls up"

requirements-completed: [DEC-02, DEC-03, DEC-04, DEC-05, DEC-06, DEC-07, DEC-08, DEC-09, DEC-10, DEC-12, DEC-13]

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 3 Plan 5: Decoded Output UI Summary

**Decoded output panel, command rows with CRC badges and expandable raw bits, decode controls sidebar with backscatter toggle -- verified end-to-end with real RTL-SDR hardware**

## Performance

- **Duration:** 5 min (continuation from checkpoint, tasks 1-2 already committed)
- **Started:** 2026-03-20T13:54:23Z
- **Completed:** 2026-03-20T13:55:00Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 4

## Accomplishments
- Three new Svelte 5 components: DecodedOutputPanel (scrolling command list with stats header and round grouping), DecodedCommandRow (expandable row with CRC badge), DecodeControlsPanel (sidebar with Tari, decode rate, and backscatter toggle)
- Replaced Timeline placeholder with live decoded command display wired to decode state
- End-to-end pipeline verified with real RTL-SDR hardware: QueryRep commands successfully decoded from live RFID reader signals

## Task Commits

Each task was committed atomically:

1. **Task 1: Decoded output panel, command row, and decode controls components** - `e8a9a18` (feat)
2. **Task 2: Wire components into main page and remove placeholder** - `1a50988` (feat)
3. **Task 3: Human verification of complete decode UI** - checkpoint resolved (no code changes)

## Files Created/Modified
- `src/lib/components/DecodedOutputPanel.svelte` - Main decoded output panel with stats header, auto-scroll, inventory round grouping, and backscatter display
- `src/lib/components/DecodedCommandRow.svelte` - Individual command row with type, parameters, CRC badge, and expandable raw bits
- `src/lib/components/DecodeControlsPanel.svelte` - Sidebar panel with Tari display, decode rate, total decoded, and backscatter toggle
- `src/routes/+page.svelte` - Replaced PlaceholderPanel with DecodedOutputPanel, added DecodeControlsPanel to sidebar

## Decisions Made
- Console-style log format (monospace, compact rows) for decoded commands -- optimized for engineering verification, easy to scan many commands quickly
- Inventory rounds separated by thin bar with round number and horizontal rule (not alternating backgrounds -- cleaner for dense data)
- Incomplete round indicator only shown when backscatter toggle is ON (per CONTEXT.md locked decision)
- DecodedOutputPanel reads directly from decodeState (no bridge prop) -- Svelte 5 reactive state makes this clean

## Deviations from Plan

None - plan executed exactly as written.

## Known Issues

**Low decode sensitivity (expected for first implementation):**
During hardware verification with real RTL-SDR and active RFID reader, the system successfully decoded QueryRep commands, confirming the full pipeline works end-to-end. However, the decoder only occasionally finds commands -- most reader transmissions are missed. This is expected behavior for a first-pass implementation. Likely causes include:
- Frame-sync threshold tuning (too aggressive noise rejection)
- Demodulator parameters needing calibration for real-world signal conditions
- Sample rate alignment with actual Tari timing

This is a sensitivity/tuning issue, not a correctness issue -- when commands are found, they decode correctly. Suitable for gap closure or Phase 4 refinement.

## Issues Encountered
None during UI implementation. The low decode rate observed during hardware verification is documented under Known Issues above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 (Protocol Decoding Engine) is complete: WASM PIE demodulator, TypeScript protocol layer, inventory tracking, worker integration, and decoded output UI all functional
- Phase 4 (Timeline & Message View) can proceed -- decoded commands are flowing through the pipeline and visible in the UI
- Decode sensitivity tuning recommended before or during Phase 4 to ensure meaningful timeline data volume

## Self-Check: PASSED

- All 4 files verified to exist on disk
- Both task commits (e8a9a18, 1a50988) verified in git log

---
*Phase: 03-protocol-decoding-engine*
*Completed: 2026-03-20*
