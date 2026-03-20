# Phase 3: Protocol Decoding Engine - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Take raw IQ samples from the DSP pipeline and produce a stream of decoded EPC Gen2 reader commands with validated CRC, correct parameters, and raw bit representation. Includes adaptive Tari detection, inventory round grouping, and best-effort FM0/Miller backscatter decoding. No timeline filtering, color coding, or auto-scroll — those are Phase 4 concerns.

</domain>

<decisions>
## Implementation Decisions

### Decoded Output Display
- Claude's choice on format (console-style log vs structured table) — optimized for engineering verification
- Key parameters shown by default per command (e.g., QUERY shows DR, M, Session, Q)
- Raw bits available via click/expand, not shown by default
- Replaces the "Timeline (Phase 4)" placeholder panel in the existing layout
- Decode stats (total commands, CRC pass rate, commands/sec) shown in the panel header, not the global status bar

### WASM vs JS Boundary
- WASM (C/Emscripten) handles the hot path: envelope detection, PIE symbol extraction, adaptive Tari detection — outputs a bit stream with timing
- TypeScript handles: frame sync (preamble detection), Gen2 command parsing, CRC-16 validation, command parameter extraction, inventory round grouping
- WASM demod runs inside the existing DSP Worker alongside FFT processing — no additional worker
- IQ data flows through both FFT and demod paths from the same polling loop
- Live hardware only — no file replay or recorded IQ input for Phase 3
- New DspToMainMessage types carry decoded bit stream / commands from DSP Worker to main thread

### Backscatter Handling
- FM0/Miller backscatter decoding implemented in Phase 3 (best-effort, not deferred)
- Results hidden behind an "Experimental: Show tag responses" toggle, off by default
- When enabled, tag responses shown inline with reader commands, visually distinct (warning icon + confidence %)
- Claude's discretion on minimum confidence threshold for discarding garbage decodes

### Inventory Round Grouping
- Phase 3 delivers round grouping in the decoded output panel (not deferred to Phase 4)
- Claude's choice on visual separator style (separator lines vs alternating backgrounds)
- Round numbering displayed
- Incomplete rounds flagged with indicator (e.g., "incomplete" marker)
- **Important:** Incomplete round flag only shown when backscatter display is toggled ON — when backscatter is off, we can't distinguish "no tag response" from "tag responded but not displayed," so no completeness judgment is made

### Claude's Discretion
- WASM build toolchain (Emscripten vs bare clang wasm32) — pick based on demodulator's actual needs
- Decoded output format (console log vs table vs hybrid)
- Visual separator style for inventory rounds
- Confidence threshold for backscatter discard
- WASM memory management and JS bridge design
- Exact typing of new worker messages for decoded data
- How DSP Worker splits IQ data between FFT and demod paths
- FM0 vs Miller detection heuristics

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project requirements
- `.planning/REQUIREMENTS.md` — DEC-01 through DEC-13 (protocol decoding requirements)

### Architecture
- `.planning/research/ARCHITECTURE.md` — Three-worker architecture, DSP Worker responsibilities, protocol decoder placement in DSP Worker, PIE demodulation pipeline design
- `.planning/research/STACK.md` — Technology stack, WASM toolchain considerations

### Prior phase context
- `.planning/phases/01-foundation-hardware-connection/01-CONTEXT.md` — Worker threading architecture, dark theme, engineer-level detail preference, sidebar panel pattern
- `.planning/phases/02-rf-visualization/02-CONTEXT.md` — DSP Worker FFT pipeline, worker message protocol, Canvas 2D rendering patterns, auto-degrade performance strategy

### Pitfalls
- `.planning/research/PITFALLS.md` — Main thread DSP starvation, sample drops, relevant to decode pipeline performance

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/dsp/dsp-worker.ts` — DSP Worker with ring buffer polling, FFT processing pipeline. WASM demod extends this with a parallel decode path in `pollRingBuffer()`
- `src/lib/dsp/fft-processor.ts` — FftProcessor class pattern (init, process, dispose) — good template for a DemodProcessor WASM wrapper
- `src/lib/workers/worker-messages.ts` — Typed message definitions (MainToDspMessage, DspToMainMessage). Needs new variants for decoded commands
- `src/lib/workers/worker-bridge.ts` — WorkerBridge interface routing DSP messages to UI. Needs new callback for decoded data (like existing `onFftData`)
- `src/lib/dsp/ring-buffer.ts` — SharedArrayBuffer ring buffer, already used for IQ data ingress
- `src/lib/components/PlaceholderPanel.svelte` — Timeline placeholder to be replaced by decoded output panel

### Established Patterns
- Svelte 5 runes ($state, $props) for all reactive state
- Worker typed message protocol (discriminated union types)
- MessageChannel for direct USB-to-DSP communication
- Canvas 2D rendering with requestAnimationFrame
- Collapsible sidebar panels (ConnectionPanel, TuningPanel, CaptureControls, DisplayPanel)
- DSP Worker staging buffer pattern (accumulate bytes, process when threshold reached)
- Transferable ArrayBuffer for zero-copy worker-to-main data transfer

### Integration Points
- `src/lib/dsp/dsp-worker.ts:pollRingBuffer()` — IQ data entry point; demod path added alongside FFT path
- `src/lib/workers/worker-messages.ts` — New DspToMainMessage variants for decoded commands/bits
- `src/lib/workers/worker-bridge.ts` — New callback for decoded command data
- `src/routes/+page.svelte` — Replace Timeline placeholder with decoded output component
- Sidebar — New toggle for backscatter display, potential decode controls

</code_context>

<specifics>
## Specific Ideas

No specific references or "I want it like X" moments — standard protocol analyzer patterns within the decisions captured above.

</specifics>

<deferred>
## Deferred Ideas

- File replay / recorded IQ input for testing without hardware — future phase or v2
- Color coding per command type — Phase 4 timeline UI
- Command type filtering — Phase 4 timeline UI
- Auto-scroll with pause-on-hover — Phase 4 timeline UI

</deferred>

---

*Phase: 03-protocol-decoding-engine*
*Context gathered: 2026-03-20*
