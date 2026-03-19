# Phase 1: Foundation & Hardware Connection - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

SPA scaffold with WebUSB RTL-SDR connection, tuning controls, and worker threading architecture. Engineers can connect an RTL-SDR dongle in the browser, configure it for UHF RFID reception, and have raw IQ samples flowing through a worker-based pipeline ready for downstream processing. No visualization or protocol decoding — those are Phase 2+ concerns.

</domain>

<decisions>
## Implementation Decisions

### Connection UX
- Connection controls live inline in a sidebar/header panel — no special first-run wizard or centered connect button
- WebUSB device picker filtered to known RTL2832U vendor/product IDs only — prevent wrong device selection
- Minimal inline error messages on connection failure — short text like "Device not found" or "Connection failed" next to the connect button, no platform-specific troubleshooting guidance
- Both explicit disconnect button and automatic detection of surprise USB removal with status update

### Tuning Controls
- Region dropdown (EU/US/China/Japan) that auto-sets center frequency to the selected band
- Separate manual frequency input that overrides the region preset; changing region resets to default frequency
- Gain: default to AGC (automatic gain control); toggle to manual mode reveals a gain selector with RTL-SDR's discrete dB steps
- Sample rate fixed at 2.4 MSPS — shown as read-only info, not user-configurable
- Tuning controls in a collapsible panel — default open, user can collapse to save space for visualization

### Status & Feedback
- Engineer-level detail always visible: sample rate, center freq, gain, samples received, drop count, buffer fill level
- Persistent status bar across the top of the application
- Separate start/stop capture button from connect/disconnect — connect establishes the link, start/stop controls when IQ samples flow, allowing configuration before capture
- Full-page banner replacing app content when browser doesn't support WebUSB — "This browser doesn't support WebUSB. Use Chrome or Edge." No point showing grayed-out controls

### Application Layout
- Dark-only theme — standard for RF/signal analysis tools, better contrast for spectrum displays in later phases
- Labeled placeholder panels for future phases — empty panels showing "Spectrum (Phase 2)", "Waterfall (Phase 2)", "Timeline (Phase 4)" to communicate the vision and guide layout
- Minimal branding — small "UHF RFID Analyzer" text in the status bar, no logo, no wasted space

### Claude's Discretion
- Overall layout structure (sidebar vs top-bar arrangement, panel proportions)
- Exact spacing, typography, and Tailwind styling
- Placeholder panel visual treatment (border style, text styling)
- Internal worker message protocol design
- Ring buffer sizing and configuration
- Error state wording and formatting details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project requirements
- `.planning/REQUIREMENTS.md` — HW-01 through HW-05 (hardware), TUNE-01 through TUNE-03 (tuning), INFRA-01 through INFRA-04 (infrastructure)

### Architecture
- `.planning/research/ARCHITECTURE.md` — Three-worker architecture, component responsibilities, data flow, ring buffer pattern, worker message protocol patterns
- `.planning/research/STACK.md` — SvelteKit 2, @jtarrio/webrtlsdr, Comlink, Tailwind CSS 4, vite-plugin-wasm, installation commands, version compatibility matrix

### Pitfalls
- `.planning/research/PITFALLS.md` — Main thread DSP starvation (Pitfall 1), sample drops (Pitfall 2), COOP/COEP headers (Pitfall 4), WebUSB device claim failures (Pitfall 5)

### Research summary
- `.planning/research/SUMMARY.md` — Executive summary, recommended stack, architecture approach, critical pitfalls, gaps to address

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — empty repository, this is the first phase

### Established Patterns
- None yet — this phase establishes all foundational patterns (worker threading, state management, component structure)

### Integration Points
- `@jtarrio/webrtlsdr` npm package — WebUSB device access, RTL2832U/R820T2 control
- `comlink` — Worker RPC for control plane messages
- `webfft` — installed in Phase 1 but used in Phase 2 for FFT computation
- COOP/COEP headers in Vite dev server config — must be set up from day one for SharedArrayBuffer

</code_context>

<specifics>
## Specific Ideas

No specific references or "I want it like X" moments — open to standard approaches within the decisions captured above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation-hardware-connection*
*Context gathered: 2026-03-19*
