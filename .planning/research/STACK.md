# Stack Research

**Domain:** Browser-based SDR application with real-time UHF RFID protocol analysis
**Researched:** 2026-03-19
**Confidence:** MEDIUM (niche domain; core web tech is well-documented but the RTL-SDR WebUSB + EPC Gen2 decoding combination is novel territory with limited prior art)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| SvelteKit | 2.x (with Svelte 5) | UI framework, SPA shell, routing | Svelte 5's runes provide fine-grained reactivity without VDOM overhead -- critical for a UI updating at 60fps with streaming RF data. Compiles away the framework, leaving minimal runtime. SPA mode via `adapter-static` gives us a pure client-side app with no server needed. 1.6KB runtime vs React's 42KB matters when we need every byte of memory for IQ sample buffers. |
| Vite | 8.x | Build tooling, dev server, HMR | Native TypeScript transpilation, first-class Web Worker support (`new Worker(url, { type: 'module' })`), WebAssembly plugin ecosystem (`vite-plugin-wasm`). Vite 8's Rolldown bundler provides 10-30x faster builds. SvelteKit uses Vite natively. |
| TypeScript | 5.x | Type safety across entire codebase | WebUSB API has TypeScript definitions in `lib.dom.d.ts`. Typed ArrayBuffers/SharedArrayBuffers catch off-by-one errors in DSP code. The `@jtarrio/webrtlsdr` library is 100% TypeScript. |
| `@jtarrio/webrtlsdr` | latest | WebUSB RTL-SDR device access | Best-maintained TypeScript RTL-SDR WebUSB library. 473 commits, powers the production radio.ea1iti.es application. Provides both high-level (`Radio` class) and low-level (`RTL2832U_Provider`) APIs. Low-level API exposes `setSampleRate()`, `setCenterFrequency()`, `setGain()`, `readSamples()` -- exactly what we need for raw IQ capture. Supports RTL-SDR Blog V3/V4 dongles explicitly. |
| WebAssembly (custom C/Emscripten) | Emscripten 3.x | EPC Gen2 PIE/FM0 demodulation, DSP pipeline | Browser JS is too slow for real-time demodulation of 2.4 MSPS IQ streams. C compiled to WASM via Emscripten gives near-native performance. SIMD support (`-msimd128`) enables vectorized operations on sample buffers. No existing WASM library does EPC Gen2 decoding -- we must write our own DSP core in C, drawing on the nkargas/Gen2-UHF-RFID-Reader GNU Radio implementation as reference. |
| Web Workers | native API | Threading: USB I/O, DSP, rendering | Main thread stays responsive for UI. Worker 1: USB read loop (readSamples). Worker 2: DSP pipeline (demod + decode). Worker 3: Visualization rendering via OffscreenCanvas. SharedArrayBuffer enables zero-copy IQ sample transfer between workers. |
| WebGL 2 / Canvas 2D | native API | Spectrum and waterfall visualization | WebGL for the waterfall display (GPU texture scrolling, colormap shader). Canvas 2D for the spectrum line plot (simpler, adequate perf for a single line at 60fps). Custom shaders give us full control over colormap, intensity mapping, and scrolling behavior -- no charting library overhead. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| webfft | 0.1.x | FFT computation | Spectrum display: converts IQ time-domain samples to frequency-domain power spectrum. Meta-library that auto-selects fastest FFT implementation (JS or WASM+SIMD) for the user's browser. Supports interleaved complex I/Q input format natively. Use for spectrum/waterfall FFT, not for the demodulation pipeline (that runs in custom WASM). |
| Comlink | 4.x | Web Worker RPC | Typed proxy interface between main thread and workers. Eliminates raw `postMessage` boilerplate. 1.1KB. Use for control messages (start/stop/configure). For high-throughput IQ data, use SharedArrayBuffer directly -- Comlink adds serialization overhead on large transfers. |
| Tailwind CSS | 4.x | Utility-first styling | Fast UI development without writing CSS files. v4 uses Rust-based Oxide engine, integrates with SvelteKit via `@tailwindcss/vite` plugin. No PostCSS dependency. Proven pairing with Svelte. |
| vite-plugin-wasm | latest | WASM ESM integration in Vite | Required to import `.wasm` modules as ES modules in Vite. Also needed inside Worker configs. Pair with `vite-plugin-top-level-await` for cleaner async WASM init. |
| `@vitest/web-worker` | latest | Testing Web Worker code | Simulates Web Workers in same thread for unit testing. Required because Vitest runs in Node, not a browser. Use for testing DSP pipeline logic and worker message protocols. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest | Unit + integration testing | Native Vite integration, TypeScript support, fast watch mode. Use `@vitest/web-worker` for worker tests. WASM testing requires `vite-plugin-wasm` in test config. |
| Emscripten SDK (emsdk) | C to WASM compilation | Install globally. Key flags: `-s EXPORT_ES6=1 -s MODULARIZE=1 -msimd128 -O3`. Produces `.wasm` + `.js` glue code. Build step outputs to `src/lib/wasm/`. |
| Playwright | E2E browser testing | Required for testing WebUSB flows (needs real Chromium). Vitest browser mode supports Playwright provider. |
| ESLint + Prettier | Code quality | Standard Svelte/TS configuration. `eslint-plugin-svelte` for Svelte-specific rules. |

## Installation

```bash
# Create project
npx sv create rfid-analyzer --template minimal --types ts
cd rfid-analyzer

# Core dependencies
npm install @jtarrio/webrtlsdr webfft comlink

# Styling
npm install -D @tailwindcss/vite tailwindcss

# Vite plugins for WASM
npm install -D vite-plugin-wasm vite-plugin-top-level-await

# Testing
npm install -D vitest @vitest/web-worker @testing-library/svelte playwright @playwright/test

# Linting
npm install -D eslint prettier eslint-plugin-svelte prettier-plugin-svelte
```

```bash
# Emscripten SDK (one-time system setup)
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@jtarrio/webrtlsdr` | `@sdr.cool/rtlsdrjs` (sandeepmistry/rtlsdrjs) | If you need Node.js support too. rtlsdrjs is the original library but less actively maintained and written in JS not TS. webrtlsdr is a cleaner TypeScript rewrite with better API design. |
| `@jtarrio/webrtlsdr` | Direct WebUSB API calls | If webrtlsdr doesn't expose a needed RTL2832U register or the library has a bug. The WebUSB API is well-documented and RTL2832U control transfers are standardized. Fallback plan, not first choice. |
| Custom C/Emscripten WASM | liquid-dsp via liquid-wasm | If someone maintained a WASM build of liquid-dsp. The existing liquid-wasm repo (heyaphra) is abandoned since 2019 with no releases. liquid-dsp itself is excellent C DSP code and its filter/modem primitives could be compiled fresh with Emscripten if needed -- but for EPC Gen2 specifically we need custom protocol logic anyway. |
| Custom C/Emscripten WASM | Pure TypeScript DSP | For prototyping only. TypeScript with Float32Array can handle FFT for display, but 2.4 MSPS demodulation with correlation, matched filtering, and bit extraction will drop frames. Start prototyping in TS, move hot paths to WASM when profiling shows bottlenecks. |
| Svelte 5 / SvelteKit | React + Vite | If team has zero Svelte experience and deadline is tight. React works but adds VDOM overhead that matters for 60fps real-time data rendering. Svelte's compile-time approach eliminates this entirely. |
| Svelte 5 / SvelteKit | Vanilla JS/TS (no framework) | If the UI is truly minimal (just a canvas and a few buttons). Our UI has enough complexity (settings panels, protocol decode table, multiple visualization modes) that a framework pays for itself. |
| WebGL 2 waterfall | Canvas 2D waterfall | If WebGL proves too complex for the team. Canvas 2D can do a waterfall by drawing one-pixel-tall strips and using `drawImage()` to scroll. Works at lower frame rates but simpler to implement. Start here, upgrade to WebGL if perf is insufficient. |
| webfft | pffft.wasm or custom FFT | If webfft's meta-library approach adds too much bundle size. pffft.wasm with SIMD is very fast but less convenient. For our use case (spectrum display, not the demodulation pipeline), webfft's auto-benchmarking selects optimal implementation per browser. |
| Comlink | Raw postMessage | For SharedArrayBuffer IQ data transfer (Comlink shouldn't wrap these). Use raw postMessage/SharedArrayBuffer for the high-bandwidth IQ data path. Comlink is only for the control plane (config changes, start/stop commands). |
| Tailwind CSS 4 | Plain CSS / CSS Modules | If you philosophically oppose utility classes. This is a specialized engineering tool, not a marketing site -- Tailwind's rapid prototyping speed matters more than pixel-perfect design tokens. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Web Audio API for DSP | Designed for audio (max 48kHz sample rate). UHF RFID needs 2.4 MSPS processing. Web Audio's `AnalyserNode` FFT is limited to audio frequencies and cannot process arbitrary IQ sample streams. | Custom WASM DSP with manual FFT via webfft |
| D3.js for spectrum/waterfall | Massive library (230KB+), SVG-based rendering cannot handle 60fps waterfall updates with thousands of frequency bins. DOM manipulation overhead kills performance. | Direct WebGL 2 shaders for waterfall, Canvas 2D for spectrum line |
| Chart.js / Plotly / Recharts | Same SVG/Canvas abstraction overhead problem. These are designed for business charts, not real-time signal visualization. | Custom Canvas 2D / WebGL rendering |
| Socket.io / WebSocket server | This is a fully client-side application. No server needed. Adding a server defeats the core value proposition (zero-install, runs entirely in browser). | Direct WebUSB via `@jtarrio/webrtlsdr` |
| `@sdr.cool/rtlsdrjs` as primary | JavaScript (not TypeScript), less active maintenance, API is less clean than webrtlsdr. Acceptable as reference but not primary dependency. | `@jtarrio/webrtlsdr` |
| GNU Radio / GR in browser | GNU Radio is a desktop C++ framework. No viable browser port exists. The nkargas/Gen2-UHF-RFID-Reader is useful as algorithm reference only. | Custom WASM implementation using GNU Radio code as algorithmic reference |
| Next.js / Nuxt / Angular | Server-side rendering adds complexity with zero benefit for a client-only hardware tool. React/Vue VDOM overhead is unnecessary. | SvelteKit in SPA mode |
| WebGPU | Still experimental, not universally available in Chrome stable (requires flags in some configurations). WebGL 2 is sufficient for our visualization needs and has universal Chromium support. | WebGL 2 for GPU rendering |

## Stack Patterns by Variant

**If the DSP pipeline proves too slow in WASM:**
- Profile first: identify whether bottleneck is USB read, FFT, demodulation, or rendering
- Consider reducing sample rate (1.024 MSPS may suffice for single-channel RFID capture)
- Enable WASM SIMD (`-msimd128` flag) if not already enabled
- Move FFT computation into the DSP WASM module instead of using webfft separately

**If WebGL waterfall is too complex to implement initially:**
- Start with Canvas 2D waterfall (drawImage scrolling technique)
- Profile: if rendering takes >8ms per frame at target resolution, migrate to WebGL
- The jledet/waterfall GitHub project provides a Canvas 2D reference implementation

**If `@jtarrio/webrtlsdr` doesn't meet a specific need:**
- Fork and extend -- it's Apache 2.0 licensed, 100% TypeScript
- Or write a thin WebUSB wrapper for just the RTL2832U + R820T2 registers we need
- The RTL2832U datasheet and rtl-sdr C library are well-documented reference material

**If SharedArrayBuffer is not available (COOP/COEP headers missing):**
- SharedArrayBuffer requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` HTTP headers
- Configure these in your static file server / Vite dev server config
- Without SharedArrayBuffer, fall back to `postMessage` with Transferable ArrayBuffers (zero-copy transfer but ownership moves, preventing shared access)
- This is a deployment concern, not a code concern -- Vite dev server can be configured easily

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| SvelteKit 2.x | Svelte 5.x | SvelteKit 2 requires Svelte 5. Uses runes by default. |
| SvelteKit 2.x | Vite 8.x | SvelteKit 2 was originally released with Vite 5 support, updated for Vite 6/7/8. Check `@sveltejs/kit` changelog for Vite 8 compatibility. May need to use Vite 7.x if SvelteKit 2.x hasn't released Vite 8 adapter yet. |
| Tailwind CSS 4.x | `@tailwindcss/vite` plugin | No PostCSS needed. Configuration moves to CSS `@theme` directives. No `tailwind.config.js`. |
| vite-plugin-wasm | Vite 8.x | Verify compatibility with Vite 8's Rolldown bundler. May need update. Fallback: use `.wasm?init` import syntax which is Vite-native. |
| Emscripten output | vite-plugin-wasm | Compile with `-s EXPORT_ES6=1 -s MODULARIZE=1` for ES module output compatible with Vite imports. |
| webfft 0.1.x | Web Workers | FFT can run in a worker. Pass interleaved Float32Array I/Q data. |
| Comlink 4.x | Vite Workers | Works with Vite's `new Worker()` syntax. TypeScript types preserved via `Remote<T>`. |
| `@jtarrio/webrtlsdr` | Chrome 118+ | Requires WebUSB API. Works on Chrome, Edge, Opera. Not Firefox/Safari. |
| SharedArrayBuffer | Chrome with COOP/COEP | Requires secure context (HTTPS or localhost) + correct HTTP headers. |
| WebGL 2 | Chrome 56+ | Universal support in all Chromium browsers. No compatibility concerns. |
| WASM SIMD | Chrome 91+ | Widely supported in 2025+. Significant perf boost for vectorized DSP operations. |

## EPC Gen2 Protocol Implementation Notes

No existing JavaScript/TypeScript or WASM library implements EPC Gen2 decoding. This is custom work. Key references:

| Reference | What to Extract | Language |
|-----------|----------------|----------|
| [nkargas/Gen2-UHF-RFID-Reader](https://github.com/nkargas/Gen2-UHF-RFID-Reader) | Gate detector (reader command detection), Tag decoder (FM0 frame sync, channel estimation, symbol detection), Reader command structure | C++ / GNU Radio |
| [GS1 EPC Gen2 Standard v2.0.1](https://www.gs1.org/sites/default/files/docs/epc/Gen2_Protocol_Standard.pdf) | PIE encoding timing (Tari = 6.25-25us, data-0 = Tari, data-1 = 1.5-2.0x Tari), command formats (Query, ACK, Select, etc.), FM0/Miller encoding specs, modulation parameters | Specification PDF |
| [ianhchuang/EPC-Gen2-RFID-Tag-Baseband-Processor](https://github.com/ianhchuang/EPC-Gen2-RFID-Tag-Baseband-Processor) | FM0 and Miller encoder/decoder logic, frame structure | Verilog (algorithm reference) |

The DSP pipeline for reader command decoding:
1. **IQ samples in** (2.4 MSPS from RTL-SDR via WebUSB)
2. **Envelope detection** (magnitude of complex samples: `sqrt(I^2 + Q^2)`)
3. **PIE symbol detection** (measure pulse intervals, classify as data-0/data-1/delimiter)
4. **Frame synchronization** (detect preamble/frame-sync patterns)
5. **Command decoding** (parse bit stream into EPC Gen2 command structures)
6. **Output** (decoded command + raw bits + timestamp to UI)

## Sources

- [jtarrio/webrtlsdr](https://github.com/jtarrio/webrtlsdr) -- Primary RTL-SDR WebUSB library, 100% TypeScript, powers radio.ea1iti.es (MEDIUM confidence: active project with 473 commits, but npm version unverified)
- [jtarrio/radioreceiver](https://github.com/jtarrio/radioreceiver) -- Production browser SDR app, architectural reference (MEDIUM confidence: 438 commits, last commit Feb 2024)
- [sandeepmistry/rtlsdrjs](https://github.com/sandeepmistry/rtlsdrjs) -- Alternative RTL-SDR library, JS not TS (MEDIUM confidence: established but less maintained)
- [IQEngine/WebFFT](https://github.com/IQEngine/WebFFT) -- FFT meta-library, v0.1.58 (HIGH confidence: verified version, npm published)
- [GS1 EPC Gen2 Standard](https://ref.gs1.org/standards/gen2/) -- Protocol specification (HIGH confidence: authoritative standard)
- [nkargas/Gen2-UHF-RFID-Reader](https://github.com/nkargas/Gen2-UHF-RFID-Reader) -- GNU Radio EPC Gen2 reader, algorithm reference (HIGH confidence: academic project, well-documented)
- [Building a Signal Analyzer with Modern Web Tech](https://cprimozic.net/blog/building-a-signal-analyzer-with-modern-web-tech/) -- Architecture reference for SharedArrayBuffer + OffscreenCanvas + WASM SIMD pattern (HIGH confidence: detailed technical blog with working demo)
- [GoogleChromeLabs/Comlink](https://github.com/GoogleChromeLabs/comlink) -- Web Worker RPC, v4.x, 1.1KB (HIGH confidence: Google-maintained, widely used)
- [Svelte 5 release](https://svelte.dev/blog/svelte-5-is-alive) -- Runes reactivity system (HIGH confidence: official Svelte blog)
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) -- Rolldown bundler, March 2026 (HIGH confidence: official Vite blog)
- [Tailwind CSS 4](https://tailwindcss.com/docs/compatibility) -- Rust-based Oxide engine, Vite plugin (HIGH confidence: official docs)
- [Emscripten documentation](https://emscripten.org/docs/compiling/WebAssembly.html) -- C to WASM compilation (HIGH confidence: official docs)
- [WebUSB API spec](https://wicg.github.io/webusb/) -- W3C Community Group specification (HIGH confidence: authoritative)
- [jledet/waterfall](https://github.com/jledet/waterfall) -- Canvas waterfall reference implementation (LOW confidence: small experiment project, useful as reference only)
- [heyaphra/liquid-wasm](https://github.com/heyaphra/liquid-wasm) -- WASM build of liquid-dsp, abandoned 2019 (LOW confidence: not maintained, proof-of-concept only)

---
*Stack research for: Browser-based UHF RFID protocol analyzer with RTL-SDR via WebUSB*
*Researched: 2026-03-19*
