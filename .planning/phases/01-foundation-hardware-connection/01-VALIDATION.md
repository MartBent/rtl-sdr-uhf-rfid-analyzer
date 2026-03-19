---
phase: 1
slug: foundation-hardware-connection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 + @vitest/web-worker 4.1.0 |
| **Config file** | `vitest.config.ts` (or inline in `vite.config.ts`) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | HW-01 | manual-only | N/A -- requires physical USB device + browser UI gesture | N/A | ⬜ pending |
| 01-01-02 | 01 | 1 | HW-02 | unit | `npx vitest run src/lib/state/sdr-state.test.ts -t "connection status"` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | HW-03 | unit | `npx vitest run src/lib/config/gain-steps.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | HW-04 | unit | `npx vitest run src/lib/state/sdr-state.test.ts -t "frequency"` | ❌ W0 | ⬜ pending |
| 01-01-05 | 01 | 1 | HW-05 | unit | `npx vitest run src/lib/config/regions.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-06 | 01 | 1 | TUNE-01 | unit | `npx vitest run src/lib/config/regions.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-07 | 01 | 1 | TUNE-02 | unit | `npx vitest run src/lib/state/sdr-state.test.ts -t "region"` | ❌ W0 | ⬜ pending |
| 01-01-08 | 01 | 1 | TUNE-03 | unit | `npx vitest run src/lib/state/sdr-state.test.ts -t "manual frequency"` | ❌ W0 | ⬜ pending |
| 01-01-09 | 01 | 1 | INFRA-01 | smoke | `npm run build && ls build/index.html` | ❌ W0 | ⬜ pending |
| 01-01-10 | 01 | 1 | INFRA-02 | unit | `npx vitest run src/lib/utils/feature-detect.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-11 | 01 | 1 | INFRA-03 | unit | `npx vitest run src/lib/workers/worker-bridge.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-12 | 01 | 1 | INFRA-04 | unit | `npx vitest run src/lib/utils/feature-detect.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` or vitest section in `vite.config.ts` — test framework configuration
- [ ] `src/lib/config/regions.test.ts` — covers TUNE-01, HW-05
- [ ] `src/lib/config/gain-steps.test.ts` — covers HW-03
- [ ] `src/lib/state/sdr-state.test.ts` — covers HW-02, HW-04, TUNE-02, TUNE-03
- [ ] `src/lib/utils/feature-detect.test.ts` — covers INFRA-02, INFRA-04
- [ ] `src/lib/workers/worker-bridge.test.ts` — covers INFRA-03
- [ ] Framework install: `npm install -D vitest @vitest/web-worker`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WebUSB device picker shows RTL-SDR devices | HW-01 | Requires physical USB device + browser UI gesture | 1. Open app in Chrome, 2. Click Connect, 3. Verify device picker filters to RTL-SDR devices |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
