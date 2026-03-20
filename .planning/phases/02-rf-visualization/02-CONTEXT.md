# Phase 2: RF Visualization - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Live spectrum display and waterfall spectrogram showing RF activity in the UHF RFID band. Engineers see a real-time FFT spectrum plot and a scrolling waterfall, visually confirming their hardware is working and RFID reader transmissions are present. Can adjust FFT size and averaging. No protocol decoding or timeline — those are Phase 3+ concerns.

</domain>

<decisions>
## Implementation Decisions

### Spectrum Display
- Classic line trace (single line showing power vs frequency) — standard SDR tool style
- Y-axis in dBFS (decibels relative to full scale), range typically -100 to 0 dBFS
- Adjustable dB range — user can set floor and ceiling to zoom into signal range of interest
- Peak hold with decay — second fading trace marking peak power at each frequency bin, decays over a few seconds
- Subtle gray grid lines at regular dB/MHz intervals with axis labels
- Frequency axis shows absolute MHz values (e.g., 865.0, 866.0, 867.0 MHz), not relative offset
- No zoom/pan — full 2.4 MHz bandwidth fits comfortably for single-channel RFID monitoring

### Waterfall Rendering
- Newest data at top, scrolls downward — standard SDR waterfall direction
- Classic blue-to-red heat map color palette (black → blue → cyan → green → yellow → red → white)
- Canvas 2D rendering — ImageData pixel manipulation, shift rows down, draw new row at top
- Fixed canvas height — waterfall fills allocated panel space, history is however many rows fit the panel
- No offscreen buffer or scrollback — minimal memory (~1.6 MB for a 1000×400 canvas)

### FFT Data Pipeline
- FFT computation in the existing DSP Worker — extends the skeleton that currently reads and discards IQ data
- Uses webfft library (already installed in Phase 1)
- Results sent to main thread via postMessage with transferable ArrayBuffer — zero-copy
- Render loop driven by requestAnimationFrame at 60 fps target
- DSP Worker computes FFTs continuously, accumulates averaged result; main thread picks up latest each frame
- Decoupled: FFT rate independent of render rate

### Visualization Controls
- New "Display" collapsible panel in the sidebar, below existing Tuning Panel — consistent with Phase 1 sidebar pattern
- FFT size dropdown (256, 512, 1024, 2048)
- Spectrum averaging control
- dB range min/max adjustment

### Performance
- Auto-reduce render rate when frames are being dropped (60 → 30 → 15 fps) with throttle indicator
- DSP Worker continues processing in background tabs; only rendering pauses (browser throttles rAF naturally)
- Memory budget: match canvas pixel height, no offscreen buffers
- Pre-allocated buffers where possible to minimize GC pressure

### Claude's Discretion
- FFT windowing function (Blackman-Harris, Hann, or other — pick best for UHF RFID signal analysis)
- Exact color values for heat map gradient
- Peak hold decay rate
- Spectrum line trace color and styling
- Exact grid line spacing and label formatting
- Canvas resize handling and DPI scaling
- DC offset removal / IQ imbalance correction approach
- FFT overlap percentage
- Auto-degrade thresholds (when to step down fps)
- Averaging algorithm (exponential moving average vs linear)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project requirements
- `.planning/REQUIREMENTS.md` — VIS-01 through VIS-05 (RF visualization requirements)

### Architecture
- `.planning/research/ARCHITECTURE.md` — Three-worker architecture, DSP Worker responsibilities, ring buffer pattern, worker message protocol
- `.planning/research/STACK.md` — webfft library details, SvelteKit 2 / Svelte 5 patterns, Tailwind CSS 4

### Phase 1 context
- `.planning/phases/01-foundation-hardware-connection/01-CONTEXT.md` — Dark theme decision, sidebar layout, status bar, worker threading architecture, engineer-level detail preference

### Pitfalls
- `.planning/research/PITFALLS.md` — Main thread DSP starvation (Pitfall 1), sample drops (Pitfall 2)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/dsp/dsp-worker.ts` — DSP Worker skeleton, already reads ring buffer via polling loop. Phase 2 replaces the "read and discard" logic with FFT computation
- `src/lib/dsp/ring-buffer.ts` — SharedArrayBuffer ring buffer with reader/writer handles via ringbuf.js
- `src/lib/workers/worker-bridge.ts` — Worker control interface, routes DSP messages to Svelte state. Needs new message types for FFT data
- `src/lib/workers/worker-messages.ts` — Typed message definitions. Needs DspToMainMessage variants for FFT results
- `src/lib/components/PlaceholderPanel.svelte` — Will be replaced by actual Spectrum and Waterfall components
- `src/lib/state/sdr-state.svelte.ts` — Svelte 5 $state() pattern for reactive SDR state
- `webfft` — Already installed (package.json), not yet imported anywhere

### Established Patterns
- Svelte 5 runes ($state, $props) — all state management uses this pattern
- Worker communication via typed messages (MainToUsb, UsbToMain, UsbToDsp, DspToMain)
- MessageChannel for direct USB→DSP worker communication (bypasses main thread)
- Collapsible sidebar panels (ConnectionPanel, TuningPanel, CaptureControls)
- Dark-only theme with Tailwind CSS (bg-gray-950 sidebar, bg-gray-900 panels, border-gray-700)

### Integration Points
- `src/routes/+page.svelte` — Main layout with sidebar + main content area. PlaceholderPanels replaced here
- `src/lib/workers/worker-bridge.ts` — DSP Worker message routing. New FFT message handler goes here
- `src/lib/dsp/dsp-worker.ts` — pollRingBuffer() function. FFT processing replaces the discard logic
- `src/lib/workers/worker-messages.ts` — Add new DspToMainMessage types for spectrum/waterfall data

</code_context>

<specifics>
## Specific Ideas

No specific references or "I want it like X" moments — standard SDR tool patterns (SDR#, GQRX style) within the decisions captured above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-rf-visualization*
*Context gathered: 2026-03-20*
