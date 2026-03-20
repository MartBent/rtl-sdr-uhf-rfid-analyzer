# Roadmap: UHF RFID Analyzer

## Overview

This roadmap takes the project from an empty repository to a working browser-based UHF RFID protocol analyzer. The dependency chain is strict: hardware access and IQ sample streaming must work before visualization, visualization must work before protocol decoding (so you can see what the decoder should find), and decoding must work before the timeline UI has anything to display. Four phases, each delivering a coherent, verifiable capability that unblocks the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Hardware Connection** - SPA scaffold with WebUSB RTL-SDR connection, tuning controls, and worker threading architecture
- [x] **Phase 2: RF Visualization** - Live spectrum display and waterfall spectrogram showing RF activity in the UHF RFID band (completed 2026-03-20)
- [ ] **Phase 3: Protocol Decoding Engine** - PIE demodulation, EPC Gen2 command parsing, CRC validation, and adaptive Tari detection in WASM
- [ ] **Phase 4: Timeline & Message View** - Live scrolling decoded message timeline with timestamps, color coding, filtering, and inter-command timing

## Phase Details

### Phase 1: Foundation & Hardware Connection
**Goal**: Engineers can connect an RTL-SDR dongle in the browser, configure it for UHF RFID reception, and have raw IQ samples flowing through a worker-based pipeline ready for downstream processing
**Depends on**: Nothing (first phase)
**Requirements**: HW-01, HW-02, HW-03, HW-04, HW-05, TUNE-01, TUNE-02, TUNE-03, INFRA-01, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. User can open the application in Chrome/Edge and see a clear error message if the browser does not support WebUSB
  2. User can click a connect button, see the WebUSB device picker, select an RTL-SDR dongle, and see a connected status indicator
  3. User can select a UHF RFID region preset (EU, US, China, Japan) and see the center frequency auto-update to the selected band, or manually override frequency, gain, and sample rate
  4. IQ samples flow from the RTL-SDR through a USB Worker to a DSP Worker via SharedArrayBuffer without blocking the main UI thread (verified by UI remaining responsive during active capture)
  5. COOP/COEP headers are configured so SharedArrayBuffer is available in both development and production environments
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md -- Scaffold SvelteKit SPA, install dependencies, configure COOP/COEP headers, create types/config/state modules and unit tests
- [x] 01-02-PLAN.md -- Build USB Worker with RTL-SDR device wrapper, DSP Worker skeleton, SharedArrayBuffer ring buffer, and worker bridge
- [x] 01-03-PLAN.md -- Build complete UI (status bar, connection controls, tuning panel, capture controls, placeholder panels) and human verification

### Phase 2: RF Visualization
**Goal**: Engineers can see live RF activity in the UHF RFID band as both a spectrum display and a scrolling waterfall, visually confirming that their hardware is working and RFID reader transmissions are present
**Depends on**: Phase 1
**Requirements**: VIS-01, VIS-02, VIS-03, VIS-04, VIS-05
**Success Criteria** (what must be TRUE):
  1. User sees a live spectrum (FFT) plot that updates in real-time showing signal power across the tuned bandwidth
  2. User sees a live waterfall spectrogram scrolling over time with color-mapped signal strength, clearly showing RFID reader transmission bursts
  3. User can adjust FFT size (256/512/1024/2048) and spectrum averaging, and see the display respond accordingly
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md -- FFT data pipeline: pure DSP modules (window function, colormap, FFT processor), display state, DSP Worker integration, and worker bridge FFT routing
- [x] 02-02-PLAN.md -- Visualization UI: spectrum and waterfall Canvas 2D renderers, Svelte canvas components with rAF render loop, Display sidebar panel, and main page wiring

### Phase 3: Protocol Decoding Engine
**Goal**: The system can take raw IQ samples from the DSP pipeline and produce a stream of decoded EPC Gen2 reader commands with validated CRC, correct parameters, and raw bit representation
**Depends on**: Phase 2
**Requirements**: DEC-01, DEC-02, DEC-03, DEC-04, DEC-05, DEC-06, DEC-07, DEC-08, DEC-09, DEC-10, DEC-11, DEC-12, DEC-13
**Success Criteria** (what must be TRUE):
  1. System demodulates PIE-encoded signals from raw IQ samples with adaptive Tari detection (working across the full 6.25-25 microsecond Tari range)
  2. System correctly decodes all core EPC Gen2 reader commands (Query, QueryRep, QueryAdjust, ACK, NAK, Select, ReqRN) with their full parameters displayed
  3. System validates CRC-16 on decoded frames and shows pass/fail status on each command
  4. System displays raw bits/symbols alongside each decoded command so engineers can verify decode correctness
  5. System groups decoded commands into inventory rounds (Query through ACK sequences) and attempts experimental FM0/Miller backscatter decoding where signal strength allows (clearly marked as experimental)
**Plans**: 5 plans

Plans:
- [ ] 03-01-PLAN.md -- TypeScript protocol layer: Gen2 types, CRC-5/CRC-16 validation, Gen2 command parser (all 7 types), frame-sync with adaptive Tari detection
- [ ] 03-02-PLAN.md -- WASM PIE demodulator: C/Emscripten envelope detector with noise gate, Makefile build system, DemodProcessor TypeScript wrapper
- [ ] 03-03-PLAN.md -- Inventory round tracker, experimental FM0 backscatter decoder, decode state ring buffer with statistics
- [ ] 03-04-PLAN.md -- DSP Worker dual-path integration (FFT + demod), worker message types extension, worker bridge decoded data routing
- [ ] 03-05-PLAN.md -- Decoded output panel UI, command row component, decode controls sidebar, page wiring, human verification

### Phase 4: Timeline & Message View
**Goal**: Engineers see decoded RFID protocol messages in a live scrolling timeline that makes it easy to understand reader behavior, timing patterns, and command sequences at a glance
**Depends on**: Phase 3
**Requirements**: TL-01, TL-02, TL-03, TL-04, TL-05, TL-06
**Success Criteria** (what must be TRUE):
  1. User sees a live scrolling list of decoded messages with millisecond timestamps and inter-command timing displayed on each entry
  2. Each message is color-coded by command type (visually distinct colors for Query, ACK, NAK, Select, etc.) and shows decoded parameters in a readable format
  3. User can filter the message list by command type to isolate specific protocol behavior
  4. Message list auto-scrolls during live capture and pauses scrolling when the user hovers over it to inspect entries
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Hardware Connection | 3/3 | Complete | 2026-03-20 |
| 2. RF Visualization | 2/2 | Complete   | 2026-03-20 |
| 3. Protocol Decoding Engine | 0/5 | Not started | - |
| 4. Timeline & Message View | 0/2 | Not started | - |
