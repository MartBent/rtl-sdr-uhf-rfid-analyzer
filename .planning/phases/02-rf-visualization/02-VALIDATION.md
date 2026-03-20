---
phase: 2
slug: rf-visualization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` or "none — Wave 0 installs" |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | VIS-01 | unit | `npx vitest run src/lib/dsp/__tests__/fft-pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | VIS-03 | unit | `npx vitest run src/lib/dsp/__tests__/fft-pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | VIS-02 | manual | Browser visual check | N/A | ⬜ pending |
| 02-02-02 | 02 | 1 | VIS-04 | manual | Browser visual check | N/A | ⬜ pending |
| 02-02-03 | 02 | 1 | VIS-05 | unit | `npx vitest run src/lib/components/__tests__/display-controls.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/dsp/__tests__/fft-pipeline.test.ts` — stubs for VIS-01, VIS-03 (FFT computation, windowing, dBFS conversion, averaging)
- [ ] `src/lib/components/__tests__/display-controls.test.ts` — stubs for VIS-05 (FFT size, averaging controls)
- [ ] vitest config — verify existing or create

*Existing vitest infrastructure from Phase 1 may cover framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live spectrum FFT plot renders and updates in real-time | VIS-01 | Visual rendering requires browser canvas | Open app, start capture, verify live spectrum trace updates smoothly |
| Waterfall scrolls with color-mapped signal strength | VIS-02 | Canvas pixel rendering, visual color mapping | Open app, start capture, verify waterfall scrolls top-to-bottom with heat map colors |
| RFID reader bursts visible as bright bands | VIS-04 | Requires real RF signal or simulated IQ data | With RFID reader active, verify bright horizontal bands appear in waterfall |

*All visual rendering behaviors require manual browser verification. Unit tests cover the data pipeline.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
