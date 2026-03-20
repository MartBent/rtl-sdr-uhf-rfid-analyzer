---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 03-03-PLAN.md
last_updated: "2026-03-20T13:41:23.625Z"
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 10
  completed_plans: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** Engineers can see exactly what their UHF RFID reader is transmitting -- decoded EPC Gen2 commands with timing, raw bits, and RF visualization -- without expensive dedicated test equipment.
**Current focus:** Phase 03 — protocol-decoding-engine

## Current Position

Phase: 03 (protocol-decoding-engine) — EXECUTING
Plan: 5 of 5

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: 6min
- Total execution time: ~0.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 P01 | 5min | 2 tasks | 21 files |
| Phase 01 P02 | 9min | 2 tasks | 7 files |
| Phase 02 P01 | 5min | 2 tasks | 12 files |
| Phase 02 P02 | 6min | 3 tasks | 11 files |

**Recent Trend:**

- Last 5 plans: 6min avg
- Trend: stable

| Phase 03 P02 | 6min | 2 tasks | 6 files |
| Phase 03 P01 | 10min | 2 tasks | 7 files |
| Phase 03 P04 | 5min | 2 tasks | 3 files |
| Phase 03 P03 | 6min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Coarse granularity -- 4 phases following strict dependency chain: hardware -> visualization -> decoding -> timeline
- [Research]: Three-worker architecture (USB Worker, DSP Worker, Main Thread) must be established in Phase 1 -- cannot be retrofitted
- [Research]: Custom C/Emscripten WASM required for EPC Gen2 PIE demodulation -- no existing library; JS too slow for 2.4 MSPS
- [Phase 01]: Removed vite-plugin-top-level-await -- incompatible with Vite 8 Rolldown; native support in Vite 8
- [Phase 01]: Used Svelte 5 $props() with @render children() instead of deprecated slot syntax
- [Phase 01]: Used RTL2832U.open() directly instead of RTL2832U_Provider for worker-compatible WebUSB pattern
- [Phase 01]: Ring buffer created per capture session in USB Worker, not at init -- allows clean state per session
- [Phase 01]: MessageChannel for direct USB-to-DSP worker communication -- bypasses main thread for IQ data
- [Phase 02]: Staging buffer in DSP Worker accumulates IQ bytes until fftSize samples available for FFT processing
- [Phase 02]: FFT shift applied during magnitude computation loop (not separate pass) for single-loop efficiency
- [Phase 02]: FftProcessor returns avgSpectrum reference -- caller copies before transferable postMessage
- [Phase 02]: Waterfall uses device pixels directly (no ctx.scale) for crisp row rendering
- [Phase 02]: rAF auto-degrade: 60-frame window, >15 slow frames degrades fps, <6 recovers
- [Phase 02]: Frequency propagation to DSP Worker requires explicit configure message forwarding (discovered during hardware verification)
- [Phase 03]: Emscripten with -sENVIRONMENT=worker for minimal WASM output targeting DSP Worker context
- [Phase 03]: Fixed 4MB WASM heap (-sALLOW_MEMORY_GROWTH=0) prevents HEAP view invalidation
- [Phase 03]: WASM build artifacts committed to repo for deployment without requiring Emscripten
- [Phase 03]: Mock WASM testing approach for reliable vitest node-environment tests
- [Phase 03]: CRC bit-level algorithm uses MSB-XOR (not LSB-shift-in) to match standard byte-level CRC
- [Phase 03]: EBV uses 8-bit octets (1 continuation + 7 value bits) per Gen2 spec
- [Phase 03]: Demod path processes same IQ buffer as FFT path in single read loop (no data duplication)
- [Phase 03]: WASM demod init is async with null-gate pattern; decoded commands batched at 100ms intervals
- [Phase 03]: FM0 decoder uses normalized cross-correlation with channel amplitude gating for noise rejection
- [Phase 03]: Ring buffer uses array slice(-MAX) for Svelte 5 reactivity (not pointer-based ring buffer)

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Verify @jtarrio/webrtlsdr npm published version matches GitHub source before committing to it
- [Research]: Verify SvelteKit 2 / Vite compatibility (Vite 8 Rolldown may have issues)
- [Research]: Phase 3 is highest technical risk -- no prior art for browser-based EPC Gen2 PIE demod in WASM

## Session Continuity

Last session: 2026-03-20T13:41:23.622Z
Stopped at: Completed 03-03-PLAN.md
Resume file: None
