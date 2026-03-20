---
phase: 3
slug: protocol-decoding-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | DEC-01 | unit | `npx vitest run src/lib/dsp/demod-processor.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | DEC-02 | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | DEC-03 | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | DEC-04 | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 1 | DEC-05 | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-05 | 02 | 1 | DEC-06 | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-06 | 02 | 1 | DEC-07 | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-07 | 02 | 1 | DEC-08 | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-08 | 02 | 1 | DEC-09 | unit | `npx vitest run src/lib/protocol/gen2-crc.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-09 | 02 | 1 | DEC-10 | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-10 | 02 | 1 | DEC-11 | unit | `npx vitest run src/lib/protocol/frame-sync.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | DEC-12 | unit | `npx vitest run src/lib/protocol/inventory-tracker.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | DEC-13 | unit | `npx vitest run src/lib/protocol/fm0-decoder.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/protocol/gen2-crc.test.ts` — stubs for DEC-09 (CRC-5 and CRC-16 validation)
- [ ] `src/lib/protocol/gen2-decoder.test.ts` — stubs for DEC-02 through DEC-08, DEC-10 (command parsing)
- [ ] `src/lib/protocol/frame-sync.test.ts` — stubs for DEC-11 (adaptive Tari, preamble detection)
- [ ] `src/lib/protocol/inventory-tracker.test.ts` — stubs for DEC-12 (round grouping)
- [ ] `src/lib/protocol/fm0-decoder.test.ts` — stubs for DEC-13 (FM0 backscatter)
- [ ] `src/lib/dsp/demod-processor.test.ts` — stubs for DEC-01 (WASM demod integration)
- [ ] Emscripten toolchain must be installed for WASM compilation

*Existing vitest infrastructure covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live IQ → decoded commands end-to-end | DEC-01 | Requires real RTL-SDR hardware and live UHF RFID reader | Connect RTL-SDR, tune to 866.3 MHz (EU), start capture, observe decoded commands appearing in panel |
| Backscatter toggle UI | DEC-13 | Visual interaction test | Click "Experimental: Show tag responses" toggle, verify tag responses appear inline with reader commands |
| Decoded output panel replaces placeholder | All | Visual layout verification | Open app, verify Timeline placeholder replaced by decoded output panel |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
