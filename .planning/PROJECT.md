# UHF RFID Analyzer

## What This Is

A browser-based UHF RFID protocol analyzer that connects to an RTL-SDR dongle via WebUSB to capture and decode EPC Gen2 reader commands in real-time. Built for RFID engineers debugging reader behavior — shows decoded protocol messages alongside raw bits and a live spectrum/waterfall display.

## Core Value

Engineers can see exactly what their UHF RFID reader is transmitting — decoded EPC Gen2 commands with timing, raw bit representation, and RF visualization — without needing expensive dedicated RFID test equipment.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Connect to RTL-SDR V3/V4 via WebUSB (discover, select, configure)
- [ ] Select UHF RFID region presets (EU 865-868 MHz, US 902-928 MHz, etc.)
- [ ] Manual tuning controls (center frequency, gain, bandwidth)
- [ ] Live spectrum display showing RF activity in selected band
- [ ] Waterfall plot showing frequency activity over time
- [ ] Demodulate and decode EPC Gen2 reader-to-tag commands (PIE encoding)
- [ ] Decode command types: Query, QueryRep, QueryAdjust, ACK, NAK, Select, etc.
- [ ] Display decoded command parameters (session, target, Q value, etc.)
- [ ] Show raw bits/symbols alongside decoded protocol messages
- [ ] Live scrolling timeline of decoded messages with timestamps and inter-command timing
- [ ] Attempt tag backscatter (FM0/Miller) decoding where signal strength allows
- [ ] Clean, shareable UI suitable for other RFID engineers

### Out of Scope

- Session export/save (v2)
- Post-capture analysis/replay (v2)
- Tag inventory/tracking features — this is a protocol analyzer, not an RFID reader
- Mobile support — desktop browser tool
- Support for non-RTL-SDR hardware

## Context

- **EPC Gen2 (ISO 18000-63):** UHF RFID air interface standard. Reader uses PIE (Pulse Interval Encoding) on the forward link. Tags respond with FM0 or Miller-modulated backscatter on the return link.
- **RTL-SDR limitations:** ~2.4 MSPS stable sample rate with RTL2832U chipset. UHF RFID uses wideband signals — the limited bandwidth means we can capture reader commands well but tag backscatter (which is weaker and modulated on the carrier) may be difficult to decode reliably.
- **WebUSB:** Enables direct browser-to-USB communication without drivers. RTL-SDR has existing WebUSB implementations (rtl-sdr.js) that handle the USB control transfers for tuning and sample streaming.
- **Signal processing in browser:** Web Audio API and/or WebAssembly for real-time DSP. Canvas/WebGL for spectrum and waterfall rendering.

## Constraints

- **Hardware:** RTL-SDR Blog V3/V4 (RTL2832U + R820T2) — max ~2.4 MSPS stable
- **Browser:** Must support WebUSB (Chrome/Edge, not Firefox/Safari)
- **Sample rate:** Limited bandwidth means capturing full UHF RFID channel hopping is challenging — may need to focus on single channel at a time
- **Backscatter:** Tag responses are significantly weaker than reader transmissions — decoding success depends on proximity and reader power

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WebUSB for SDR access | Runs entirely in browser, no server or driver install needed | — Pending |
| RTL-SDR V3/V4 target | Most common affordable SDR, good community support | — Pending |
| Live-only for v1 | Simplifies architecture, export/replay deferred | — Pending |
| Stack TBD | Will be determined during research phase | — Pending |

---
*Last updated: 2026-03-19 after initialization*
