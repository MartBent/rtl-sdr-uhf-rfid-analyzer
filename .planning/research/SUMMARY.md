# Project Research Summary

**Project:** RTL-SDR UHF RFID Analyzer
**Domain:** Browser-based SDR application with real-time UHF RFID protocol analysis
**Researched:** 2026-03-19
**Confidence:** MEDIUM (core web tech HIGH confidence; EPC Gen2 WASM DSP is novel territory with limited browser prior art)

## Executive Summary

This project sits in a genuine market gap: a zero-install, browser-based UHF RFID protocol analyzer that replaces a $10K+ Voyantic hardware analyzer for engineers who need to observe and debug reader-to-tag communication. The closest existing tools — GNU Radio with the nkargas Gen2 reader, and commercial Voyantic hardware — are either too complex to set up or too expensive. The recommended approach is a fully client-side SvelteKit SPA with three dedicated Web Workers (USB I/O, DSP pipeline, optionally visualization), using `@jtarrio/webrtlsdr` for WebUSB hardware access and custom C/Emscripten WASM for the EPC Gen2 PIE demodulation and protocol decoding pipeline. This architecture is validated by production browser SDR applications (radio.ea1iti.es, the cprimozic signal analyzer) and must be established in Phase 1 — retrofitting threading onto a single-threaded prototype is a complete rewrite.

The core technical challenge is novel: no existing JavaScript/TypeScript/WASM library implements EPC Gen2 decoding. The demodulation pipeline must be written from scratch in C (compiled to WASM), drawing on the nkargas GNU Radio implementation as an algorithmic reference and the GS1 EPC Gen2v2 spec for timing parameters. The hardware constraint is real but manageable: the RTL-SDR's 8-bit ADC and ~2.4 MHz bandwidth is sufficient for monitoring a single RFID channel and decoding reader forward-link commands, but tag backscatter decoding is an order of magnitude harder due to the 60-80 dB power difference and should be treated as an experimental stretch goal, never a core feature.

The highest risks are architectural: main-thread DSP starvation at 2.4 MSPS will crash the app if threading is not established from day one; incorrect PIE timing thresholds will silently produce wrong decodes that look plausible; and missing COOP/COEP HTTP headers will make SharedArrayBuffer unavailable in deployment. All three must be addressed in Phase 1. The product delivers its primary value proposition — decoded reader commands in a browser, free, with a $30 dongle — without needing backscatter decoding, frequency hopping coverage, or session recording.

## Key Findings

### Recommended Stack

The stack centers on SvelteKit 2 (Svelte 5 with runes) as the UI framework for its compile-time reactivity and minimal runtime overhead — critical at 60fps with streaming RF data. Custom C compiled to WASM via Emscripten 3 is non-negotiable for the demodulation hot path: 2.4 MSPS IQ processing will exceed JavaScript's capabilities for the demod/PIE pipeline. For the spectrum/FFT display, the `webfft` library (IQEngine project) provides an auto-benchmarking meta-library that selects the fastest available FFT implementation per browser. The `@jtarrio/webrtlsdr` library is the clear choice for WebUSB hardware access — it is 100% TypeScript, actively maintained (473 commits), and powers a production browser SDR application.

**Core technologies:**
- `SvelteKit 2 / Svelte 5`: UI framework — compile-time reactivity eliminates VDOM overhead at 60fps
- `@jtarrio/webrtlsdr`: WebUSB RTL-SDR access — best-maintained TypeScript library, production-proven
- `Custom C/Emscripten WASM`: EPC Gen2 DSP/demodulation — no existing library; JS too slow for 2.4 MSPS demod
- `webfft`: Spectrum FFT — auto-selects fastest FFT implementation, handles interleaved I/Q input natively
- `Web Workers + SharedArrayBuffer`: Threading — USB I/O and DSP must run in dedicated workers; zero-copy IQ data path
- `WebGL 2`: Waterfall visualization — GPU texture scrolling for performant spectrogram rendering
- `Comlink 4`: Worker RPC — typed control messages; NOT used for high-bandwidth IQ data path
- `Tailwind CSS 4`: Styling — rapid UI development with Vite-native Oxide engine
- `Vitest + Playwright`: Testing — Vitest for unit/worker tests; Playwright required for WebUSB E2E flows

**Critical version notes:** SvelteKit 2 may need Vite 7.x if Vite 8 (Rolldown) compatibility is not yet confirmed; verify before scaffolding. WebUSB is Chrome/Edge only — Firefox and Safari users are out of scope.

### Expected Features

The product has a clear MVP: deliver decoded EPC Gen2 reader commands in a browser UI with live spectrum visualization. Everything else is enhancement or v2. The feature dependency graph is strict — protocol decode is impossible without sample streaming, and the full decode chain (IQ → envelope → PIE symbols → frame sync → Gen2 command) must be built in order.

**Must have (table stakes — v1):**
- WebUSB RTL-SDR connection with platform-specific troubleshooting guidance
- Region presets (EU 865-868 MHz, US 902-928 MHz) + frequency/gain/sample-rate controls
- Live spectrum display (FFT, Canvas 2D) — visual proof hardware works
- Waterfall display (WebGL preferred) — shows signal history and reader hopping activity
- PIE envelope detection and symbol decoding (adaptive Tari from preamble)
- EPC Gen2 command parsing — all 11 mandatory commands (Query, QueryAdjust, QueryRep, ACK, NAK, Req_RN, Read, Write, Kill, Lock, Select)
- Message list with microsecond timestamps and inter-command timing
- Color coding by command type + message detail panel + raw bits view
- Start/stop capture, signal strength indicator, dark mode UI

**Should have (competitive differentiators — v1.x):**
- Inventory round visualization (group Query→QueryRep/ACK cycles) — fills gap vs. $10K Voyantic
- Reader timing analysis with Gen2 spec-limit flagging — engineers debugging reader behavior
- Command filtering by type/session — essential when capturing busy environments
- Backscatter decode (best-effort FM0) — clearly labelled experimental, not a core feature
- Shareable URL with settings, keyboard shortcuts, quick-reference Gen2 command docs

**Defer (v2+):**
- Session recording and replay — doubles architecture surface area; not needed to validate core value
- Export (CSV/JSON) — defer until data model is stable and demand is proven
- Post-capture statistics and reports — different UI paradigm; adds scope without validating core
- Multi-SDR hardware support — RTL-SDR V3/V4 only for v1; evaluate demand after launch
- Gen2v3 command support — defer until Gen2v3 readers are common in the field

**Hard anti-features (never promise):** Tag inventory/tracking (RTL-SDR is receive-only), transmission/tag emulation (hardware limitation), mobile/tablet support (WebUSB not available on iOS).

### Architecture Approach

The architecture is a three-tier worker pipeline: a USB Worker handles all WebUSB bulk transfers and RTL2832U register control; a DSP Worker consumes IQ samples from a SharedArrayBuffer ring buffer and runs the full signal chain (DC removal → filtering → envelope detection → FFT → PIE demodulation → Gen2 parsing); the Main Thread handles only UI rendering, state management, and dispatching control commands. The visualization layer uses a pull-based requestAnimationFrame loop — it never renders on data arrival, always on display refresh rate. This decouples DSP throughput from rendering throughput and prevents backpressure in the processing pipeline.

**Major components:**
1. **USB Worker** (`src/usb/`) — WebUSB device management, RTL2832U/R820T2 register control, IQ bulk transfer loop, ring buffer producer
2. **DSP Worker** (`src/dsp/` + `src/protocol/`) — ring buffer consumer, signal chain (DC removal, filter, envelope, FFT), PIE demodulation, EPC Gen2 command decoding; hot path in WASM
3. **State Manager** (`src/state/`) — reactive store on main thread; workers push data in, UI subscribes; fixed-size ring buffer for decoded messages (cap ~10,000)
4. **Visualization Engine** (`src/viz/`) — spectrum (Canvas 2D), waterfall (WebGL 2 texture scrolling), protocol timeline; driven by requestAnimationFrame, not data events
5. **UI Layer** (`src/ui/`) — SvelteKit components for controls, message list, detail panel, settings; uses Svelte 5 runes for fine-grained reactivity
6. **WASM DSP Core** (`src/lib/wasm/`) — C compiled with Emscripten; envelope detection, PIE symbol extraction, Gen2 parsing; built with `-msimd128 -O3 -s EXPORT_ES6=1 -s MODULARIZE=1`

**Critical architectural note:** WebUSB is ONLY available on the main thread (`navigator.usb`). The device must be opened on the main thread, then a MessageChannel established to transfer data to the USB Worker. This is the one unavoidable main-thread USB coupling.

### Critical Pitfalls

1. **Main thread DSP starvation** — architect the three-worker pipeline in Phase 1; this cannot be retrofitted. A single-threaded prototype requires a complete rewrite to make real-time. Prevention: stress-test the empty pipeline at 2.4 MSPS before writing any DSP logic.

2. **RTL-SDR sample drops via WebUSB** — use large transfer sizes (16384+ bytes), run all USB reads in a dedicated worker, implement overwrite-semantics ring buffer, and expose a drop counter in the UI. Cap sample rate at 2.4 MSPS; 3.2 MSPS is unreliable over WebUSB.

3. **Incorrect PIE timing (hardcoded Tari)** — implement adaptive Tari detection from the preamble/frame-sync pattern on every transmission; never hardcode microsecond thresholds. Test with at minimum Tari=6.25, 12.5, and 25 µs. Silent wrong decodes are worse than no decodes.

4. **Missing COOP/COEP headers** — configure `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` from day one in Vite dev config and deployment. SharedArrayBuffer is unavailable without these. GitHub Pages cannot serve custom headers — use a different host or `coi-serviceworker` polyfill.

5. **WebUSB device claim failures** — build platform-specific troubleshooting directly into the connection UI (Zadig on Windows, `modprobe -r dvb_usb_rtl28xxu` on Linux). The connection sequence must be: `requestDevice()` → `open()` → `selectConfiguration(1)` → `claimInterface(0)`. Show step-by-step progress — the sequence takes 100-500ms per step.

6. **Backscatter over-scoping** — tag backscatter is 60-80 dB weaker than the reader signal; the RTL-SDR's 8-bit ADC has ~48 dB dynamic range. Do not invest in backscatter decoding until forward-link decode is solid and validated. Mark any backscatter results as experimental with confidence indicators.

## Implications for Roadmap

Research strongly supports the phase ordering found in ARCHITECTURE.md. The dependency graph is non-negotiable: you cannot decode protocol without samples; you cannot validate DSP without spectrum visualization; you cannot safely write the demodulator without seeing the signal in the waterfall first. The architecture's correctness-before-performance principle (use postMessage first, migrate to SharedArrayBuffer later) is validated by the pitfalls research.

### Phase 1: Foundation and Hardware Integration

**Rationale:** Everything depends on having working WebUSB access to the RTL-SDR and a threading architecture that does not block the main thread. Both are prerequisites for every subsequent phase and both are easy to get catastrophically wrong. The COOP/COEP headers, USB Worker, SharedArrayBuffer ring buffer, and connection troubleshooting UI must all exist before writing a single line of DSP code.

**Delivers:** Working RTL-SDR connection in the browser; raw IQ samples flowing to a DSP Worker via SharedArrayBuffer; platform-specific connection troubleshooting; COOP/COEP headers confirmed working in both dev and deployment environments.

**Addresses:** WebUSB RTL-SDR connection, start/stop capture control, region presets scaffold, sample rate selection.

**Avoids:** Main thread DSP starvation (Pitfall 1), sample drops (Pitfall 2), COOP/COEP headers (Pitfall 5), USB claim failures (Pitfall 7).

**Research flag:** Needs deeper research — WebUSB device claim sequences differ across platforms; validate the `@jtarrio/webrtlsdr` API against the current npm version before committing to it.

### Phase 2: DSP Worker and Spectrum Visualization

**Rationale:** Spectrum display is the cheapest way to validate that hardware is working and signals are present. Engineers need visual confirmation before investing in protocol decode. FFT infrastructure also provides the foundation for the waterfall in Phase 3. Getting spectrum right builds confidence that the DSP Worker pipeline is correctly wired.

**Delivers:** Live spectrum display (Canvas 2D) showing RF activity in the UHF RFID band; signal strength indicator; channel context overlay (current tuning vs. full band plan).

**Addresses:** Live spectrum display (FFT), signal strength indicator, center frequency tuning, gain control.

**Uses:** `webfft` library, Canvas 2D rendering, pull-based requestAnimationFrame loop, DSP Worker pipeline.

**Avoids:** Bandwidth misconceptions (Pitfall 3) — spectrum display must include channel context and band plan overlay.

**Research flag:** Standard patterns — FFT display and Canvas 2D rendering are well-documented. No deep research needed.

### Phase 3: Waterfall Display

**Rationale:** Waterfall (spectrum-over-time) is essential for spotting RFID reader transmissions before trying to decode them. Engineers use it to visually identify reader activity patterns, frequency hopping behavior, and signal timing. Building the waterfall before the protocol decoder means engineers can visually identify signals and confirm what the decoder should be finding.

**Delivers:** Scrolling waterfall spectrogram with configurable color map, synchronized frequency axis, time axis; visual identification of reader transmission patterns.

**Addresses:** Waterfall display, color-mapped signal strength, spectrum + waterfall combined view.

**Uses:** WebGL 2 texture-based scrolling (GPU texture shifted one row per FFT frame); Canvas 2D acceptable as starting point with migration path to WebGL.

**Avoids:** Waterfall redraw performance trap — must use WebGL texture scrolling, not full-canvas redraw.

**Research flag:** Canvas 2D starting point is well-documented (jledet/waterfall reference); WebGL texture scrolling is moderately complex. May need targeted research for WebGL waterfall implementation.

### Phase 4: RFID Signal Demodulation (DSP Core)

**Rationale:** This is the hardest phase. Adaptive PIE demodulation requires understanding the signal characteristics visible in the waterfall (Phase 3) and the IQ pipeline from Phase 2. Writing the WASM DSP core with Emscripten requires build tooling setup. Doing this phase after spectrum/waterfall means the developer can see whether the demodulator is finding real signals.

**Delivers:** DC removal, low-pass filter, envelope detection; adaptive PIE pulse interval measurement; Tari auto-detection from preamble; raw bit/symbol stream output; visual tap points for intermediate signal stages.

**Addresses:** PIE envelope detection and symbol decoding, raw bits view.

**Uses:** Custom C/Emscripten WASM core (envelope detection, PIE), Emscripten SDK with `-msimd128 -O3`, `vite-plugin-wasm` for ESM integration.

**Avoids:** Hardcoded PIE timing (Pitfall 4) — adaptive Tari is mandatory, not optional. Test against Gen2 spec's full Tari range (6.25–25 µs) before proceeding to Phase 5.

**Research flag:** Needs deep research — no prior art for browser-based EPC Gen2 PIE demodulation in WASM. Reference implementations: nkargas/Gen2-UHF-RFID-Reader (C++ GNU Radio), GS1 EPC Gen2v2 spec Section 6.3.

### Phase 5: Protocol Decoding and Timeline UI

**Rationale:** With a validated bit stream from Phase 4, this phase adds the EPC Gen2 command parser and the primary user-facing value. This is the phase that turns the tool from "browser SDR with RFID band tuning" into "UHF RFID protocol analyzer."

**Delivers:** All 11 mandatory EPC Gen2 commands decoded with parameters; scrolling message list with microsecond timestamps and inter-command timing; color coding by command type; message detail panel with field-by-field breakdown and bit positions; CRC-16 validation on every decoded command.

**Addresses:** EPC Gen2 command parsing, command parameter display, message list/timeline, timestamp and inter-command timing, color coding by command type, message detail panel.

**Uses:** Gen2 command parser in WASM (or TypeScript wrapping WASM output), virtual scrolling for message list, fixed-size ring buffer for decoded messages (10,000 cap).

**Avoids:** Skipping CRC validation (never acceptable per pitfalls); decoded message list growing without bound (ring buffer cap); sample-count-based timestamps (not wall-clock Date.now()).

**Research flag:** EPC Gen2 command structure is fully specified in GS1 standard — well-documented. Protocol parser itself is novel implementation but the spec is the sole source. No additional research needed beyond the spec.

### Phase 6: Performance Hardening

**Rationale:** Phase 5 builds a correct system; Phase 6 makes it sustain real-world 2.4 MSPS loads. Performance optimization is intentionally deferred until correctness is validated — premature optimization obscures bugs and wastes effort on code that may change.

**Delivers:** Confirmed stability at 2.4 MSPS with zero sample drops over 60-second runs; tab-in-background handling; WASM SIMD hot path if profiling shows bottleneck; OffscreenCanvas for waterfall if rendering is CPU-bound.

**Addresses:** Stable real-time operation, dropped-sample counter/warning, background tab throttling warning.

**Uses:** SharedArrayBuffer ring buffer (if not already in place from Phase 1), WASM SIMD (`-msimd128`), OffscreenCanvas (third worker) if needed.

**Avoids:** GC pressure from repeated TypedArray allocation (pre-allocate, reuse buffers); waterfall full-canvas redraw; FFT on every sample buffer (decimate to 30-60 FFTs/sec).

**Research flag:** Standard optimization patterns — well-documented for SharedArrayBuffer/WASM/OffscreenCanvas. No deep research needed; profile first, optimize only what profiling identifies.

### Phase 7: Power User Features (v1.x)

**Rationale:** After core live decode is validated with real hardware, add the features that differentiate from OpenWebRX and start to compete with Voyantic for specific use cases. Inventory round visualization and timing analysis are the highest-value differentiators — they fill the gap left by expensive commercial tools.

**Delivers:** Inventory round visualization (grouped Query/QueryRep/ACK sequences); reader timing analysis with Gen2 spec-limit checking; command filtering by type/session; shareable URL with settings; keyboard shortcuts; quick-reference Gen2 command docs; backscatter decode (FM0, experimental).

**Addresses:** Inventory round visualization, reader timing analysis, command filtering, frequency hopping visualization, best-effort backscatter decode.

**Avoids:** Backscatter over-scoping (Pitfall 6) — backscatter must be labelled experimental and deferred until forward-link decode is solid.

**Research flag:** Inventory round state machine and timing analysis are well-specified in the EPC Gen2 standard. Backscatter FM0/Miller decoding will need targeted research when the time comes.

### Phase Ordering Rationale

- USB Worker and threading infrastructure come first because the architecture cannot be retrofitted. A single-threaded prototype is not an acceptable starting point.
- Spectrum visualization precedes protocol decoding because it provides visual validation of hardware function and signal presence — without it, protocol decoder bugs are invisible.
- Waterfall precedes PIE demodulation because it lets developers visually identify RFID reader signals before writing the demodulator, and confirms signal characteristics (bandwidth, timing pattern) that inform demodulator design.
- WASM build tooling (Emscripten, vite-plugin-wasm) is introduced in Phase 4, not Phase 1, so earlier phases can be validated without WASM complexity.
- Performance hardening is Phase 6, not Phase 1, because correctness validation at lower throughputs is faster and bugs are easier to find before optimization complicates the code.
- Backscatter is always last because RTL-SDR hardware limitations make it unreliable; scoping it early would waste effort on a feature that may never work reliably in real-world conditions.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 1:** WebUSB device claim sequence and `@jtarrio/webrtlsdr` current API — verify npm published version matches GitHub source before committing to the library.
- **Phase 4:** Browser-based EPC Gen2 PIE demodulation in WASM — no prior art. Needs thorough study of nkargas GNU Radio implementation (C++ gate detector, channel estimator, symbol detector) and GS1 spec Section 6.3 before implementation. This is the highest-risk phase technically.
- **Phase 7 (backscatter):** FM0/Miller browser demodulation — sparse documentation for browser context. Research when the time comes; do not design for it in advance.

Phases with standard patterns (skip additional research):

- **Phase 2 (FFT spectrum):** Spectrum display, webfft, Canvas 2D — extensively documented.
- **Phase 5 (Gen2 parser):** Command structures are fully specified in GS1 EPC Gen2v2 standard. Implementation is mechanical once the spec is understood.
- **Phase 6 (performance):** SharedArrayBuffer patterns, WASM optimization, OffscreenCanvas — all well-documented. Profile first.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core web tech (SvelteKit, Vite, TypeScript, WebGL, Workers) is HIGH confidence. `@jtarrio/webrtlsdr` is MEDIUM — active project but npm version unverified. Custom C/Emscripten WASM for EPC Gen2 is MEDIUM — no prior browser implementations to validate against. |
| Features | MEDIUM-HIGH | Table stakes features and MVP definition are HIGH confidence (well-validated against SDR tool patterns and competitor analysis). EPC Gen2 protocol details are HIGH confidence (GS1 authoritative spec). Backscatter decode feasibility is LOW — hardware limitations are real and severe. |
| Architecture | MEDIUM-HIGH | Three-worker threading model is HIGH confidence — validated by production browser SDR applications. SharedArrayBuffer ring buffer pattern is HIGH confidence. WASM hot path integration details are MEDIUM — novel in this specific domain. |
| Pitfalls | HIGH | Most pitfalls are verified from multiple independent sources (community reports, official specs, production app experience). Backscatter difficulty is HIGH confidence (physics-based analysis). COOP/COEP requirements are HIGH confidence (official Chrome docs). |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **`@jtarrio/webrtlsdr` npm version**: The GitHub repo shows active development (473 commits) but the published npm package version needs verification before scaffolding the project. Check npm registry and confirm the TypeScript API matches what's documented.
- **Vite 8 / SvelteKit 2 compatibility**: SvelteKit 2 was built against Vite 5/6/7. Vite 8's switch to Rolldown may have compatibility issues with `@sveltejs/kit`. May need to scaffold with Vite 7 and upgrade once SvelteKit 2 confirms Vite 8 support.
- **`vite-plugin-wasm` with Vite 8**: The plugin may not support Vite 8's Rolldown bundler yet. Fallback is Vite's native `.wasm?init` import syntax — verify before committing to the plugin approach.
- **EPC Gen2 PIE demodulation WASM performance**: No browser benchmark exists for this pipeline. At 2.4 MSPS, the demod chain (envelope → pulse measurement → symbol classification) must complete in under ~5ms per 4096-sample block. This needs early profiling — if WASM SIMD is insufficient, the architecture may need a third DSP sub-worker or a lower sample rate (1.024 MSPS).
- **WebUSB stability on macOS**: The WebUSB RTL-SDR community reports macOS reconnection issues after USB suspend. This needs validation with real hardware on macOS before declaring the connection layer complete.

## Sources

### Primary (HIGH confidence)
- [GS1 EPC Gen2 Standard](https://ref.gs1.org/standards/gen2/) — PIE timing, command formats, preamble structure, FM0/Miller specs
- [jtarrio/webrtlsdr](https://github.com/jtarrio/webrtlsdr) — Primary WebUSB RTL-SDR library, TypeScript, production-proven
- [IQEngine/WebFFT](https://github.com/IQEngine/WebFFT) — FFT meta-library, v0.1.58 npm verified
- [Building a Signal Analyzer with Modern Web Tech](https://cprimozic.net/blog/building-a-signal-analyzer-with-modern-web-tech/) — SharedArrayBuffer + OffscreenCanvas + WASM SIMD architecture pattern
- [web.dev: Cross-Origin Isolation](https://web.dev/articles/coop-coep) — COOP/COEP headers for SharedArrayBuffer
- [Emscripten documentation](https://emscripten.org/docs/compiling/WebAssembly.html) — C to WASM compilation flags
- [Svelte 5 release](https://svelte.dev/blog/svelte-5-is-alive) — Runes reactivity
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) — Rolldown bundler
- [Tailwind CSS 4](https://tailwindcss.com/docs/compatibility) — Oxide engine, Vite plugin

### Secondary (MEDIUM confidence)
- [jtarrio/radioreceiver](https://github.com/jtarrio/radioreceiver) — Browser SDR architectural reference
- [nkargas/Gen2-UHF-RFID-Reader](https://github.com/nkargas/Gen2-UHF-RFID-Reader) — GNU Radio EPC Gen2 reader, algorithmic reference for WASM DSP core
- [OpenWebRX](https://www.openwebrx.de/) — Browser-based SDR architecture reference
- [FutureSDR: ZigBee SDR in Browser](https://www.futuresdr.org/blog/wasm-zigbee/) — Architecture decisions for browser SDR, threading model
- [padenot/ringbuf.js](https://github.com/padenot/ringbuf.js) — Lock-free SPSC ring buffer for SharedArrayBuffer
- [Voyantic Protocol Analyzer](https://voyantic.com/lab/protocol-analyzer/) — Commercial RFID analyzer features (competitor benchmark)
- [Hackaday: RTL-SDR With Only A Browser](https://hackaday.com/2025/03/23/rtl-sdr-with-only-a-browser/) — Community WebUSB pitfalls

### Tertiary (LOW confidence)
- [jledet/waterfall](https://github.com/jledet/waterfall) — Canvas waterfall reference, small experiment project; useful as starting point only
- [ianhchuang/EPC-Gen2-RFID-Tag-Baseband-Processor](https://github.com/ianhchuang/EPC-Gen2-RFID-Tag-Baseband-Processor) — FM0/Miller encoder/decoder in Verilog; algorithm reference only
- [heyaphra/liquid-wasm](https://github.com/heyaphra/liquid-wasm) — Abandoned WASM build of liquid-dsp; proof-of-concept that C DSP can compile to WASM, not a dependency

---
*Research completed: 2026-03-19*
*Ready for roadmap: yes*
