# Feature Research

**Domain:** Browser-based UHF RFID protocol analyzer with RTL-SDR via WebUSB
**Researched:** 2026-03-19
**Confidence:** MEDIUM-HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or unusable.

#### Hardware Connection & Control

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| WebUSB device discovery and selection | Without this, nothing works. Users need to plug in an RTL-SDR and connect. | MEDIUM | Use rtlsdrjs or webrtlsdr library. Chrome/Edge only. Must handle device permissions, connection loss, reconnection gracefully. |
| Region presets (EU 865-868 MHz, US 902-928 MHz, etc.) | RFID engineers think in regulatory regions, not raw frequencies. Every RFID tool has this. | LOW | Lookup table of ITU region frequency plans. Include EU, US/FCC, China, Japan, Korea, India at minimum. |
| Gain control (manual + auto) | Every SDR application has gain control. RF engineers need to optimize signal-to-noise ratio for their setup. | LOW | RTL-SDR R820T2 has ~0-50 dB range. Expose as slider with dB labels. Auto-gain is convenient but manual is critical for RFID work. |
| Center frequency tuning | Fundamental SDR control. Users must be able to set which frequency to observe. | LOW | Numeric entry + region preset selection. Allow fine-tuning within a channel. |
| Sample rate selection | Engineers need to understand the capture bandwidth. SDR# and GQRX both expose this. | LOW | RTL-SDR stable at 2.4 MSPS max. Offer 1.0, 1.4, 2.0, 2.4 MSPS options. |

#### RF Visualization

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Live spectrum display (FFT) | The single most expected feature of any SDR tool. Shows RF activity as power vs frequency. Without this, users cannot see what is happening on the air. | HIGH | Real-time FFT via WebAssembly. Canvas or WebGL rendering. Must sustain 15-30 FPS at 2.4 MSPS. Configurable FFT size (512-8192). |
| Waterfall display | Second most expected SDR feature. Shows spectrum history over time. Critical for spotting intermittent reader transmissions and frequency hopping. | HIGH | Scrolling spectrogram with configurable color map. WebGL preferred for performance. OpenWebRX and SDR# both have this as default view. Must show time axis. |
| Spectrum + waterfall combined view | Standard layout in SDR# / GQRX / OpenWebRX: spectrum on top, waterfall below. Users expect this arrangement. | MEDIUM | Resizable split between spectrum and waterfall panels. Synchronized frequency axis. |
| Color-mapped signal strength | Waterfall must use color to represent signal power. Standard UX pattern across all SDR tools. | LOW | Provide at least 2-3 color maps (e.g., viridis, thermal, grayscale). Adjustable min/max power levels. |

#### Protocol Decoding

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| EPC Gen2 reader command detection and decoding | The core value proposition. Detect PIE-encoded forward-link commands from the reader. Must decode the 11 mandatory Gen2 commands: Select, Query, QueryAdjust, QueryRep, ACK, NAK, Req_RN, Read, Write, Kill, Lock. | HIGH | DSP pipeline: downconvert -> envelope detect -> PIE symbol decode -> command parse. This is the hardest technical challenge. Must handle ASK modulation depth variations. |
| Command parameter display | After decoding a command, show its parameters. E.g., Query shows DR, M, TRext, Sel, Session, Target, Q. Select shows Target, Action, MemBank, Pointer, Length, Mask, Truncate. | MEDIUM | Each of the 11+ commands has a defined bit layout per the Gen2 spec. Build a structured decoder for each. Display in human-readable form. |
| Message list / timeline | Scrolling list of decoded messages with timestamps, like Wireshark's packet list pane. This is how protocol analyzers present data. | MEDIUM | Virtual scrolling for performance with large captures. Each row: timestamp, command type, key parameters summary, delta time from previous. |
| Timestamp and inter-command timing | RFID engineers debugging reader behavior need precise timing. Voyantic's key differentiator is showing "where time is spent" in inventory rounds. | MEDIUM | Microsecond-resolution timestamps derived from sample position. Show delta-T between consecutive commands. Critical for reader optimization. |

#### Protocol Analyzer UX

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Color coding by command type | Wireshark colors packets by protocol. RFID analyzers color by command category (inventory vs access vs select). Essential for visual scanning of message flow. | LOW | Assign distinct colors to command categories: inventory (Query/QueryRep/QueryAdjust), acknowledgment (ACK/NAK), select (Select), access (Read/Write/Kill/Lock/Req_RN). |
| Message detail panel | Click a message in the list, see full decoded details. Wireshark's packet detail pane is the gold standard. Show command structure, field-by-field breakdown, bit positions. | MEDIUM | Tree view or structured layout showing: raw bits, field boundaries, decoded values, field descriptions. Similar to Wireshark's protocol tree. |
| Start/Stop capture control | Basic capture lifecycle. Must be able to start capturing, stop, and see results. | LOW | Clear play/stop buttons. Visual indicator when capturing is active. |

### Differentiators (Competitive Advantage)

Features that set this tool apart from existing alternatives. The key differentiator is "zero-install, browser-based, free" vs "$10K+ Voyantic hardware" or "complex GNU Radio setup."

#### Browser-Native Advantages

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Zero-install operation | Plug in RTL-SDR, open URL, start analyzing. No drivers, no software install, no configuration files. This alone differentiates from every existing tool (GNU Radio, SDR#, Voyantic). | LOW (inherent) | This is the architectural advantage, not a feature to build. But the UX must deliver on the promise: first-use experience must be under 30 seconds from page load to seeing spectrum. |
| Shareable URL with settings | Encode frequency, gain, region, and display settings in URL hash/params. Engineers can share a configured view with colleagues. Desktop SDR tools cannot do this. | LOW | Serialize settings to URL. On load, restore from URL params. No account needed. |
| Cross-platform without porting | Works on Windows, macOS, Linux, ChromeOS -- anywhere Chrome runs. GNU Radio requires platform-specific builds. SDR# is Windows-only. | LOW (inherent) | Must test on all platforms. WebUSB behavior may differ slightly. |

#### RFID-Specific Intelligence

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Inventory round visualization | Show inventory rounds as grouped sequences (Query -> [QueryRep/ACK cycles] -> next Query). Voyantic charges thousands for this. No free tool offers it. | HIGH | Must track state machine: detect Query as round start, group subsequent QueryRep/ACK/NAK until next Query. Visualize as collapsible groups or a sequence diagram. |
| Raw bits / symbols view | Show the actual PIE symbols alongside decoded commands. Engineers debugging modulation issues need to see the raw signal. Bridges the gap between RF view and protocol view. | MEDIUM | Display bit string with PIE symbol boundaries marked. Toggle between raw bits and decoded interpretation. Sync with spectrum view to show which part of the signal corresponds to which bits. |
| Reader timing analysis | Show inter-command gaps (T1, T2, T3, T4 per Gen2 spec), flag timing violations, calculate inventory round duration. Voyantic's Protocol Analyzer does this but costs $$$. | HIGH | Parse timing parameters from signal. Compare against Gen2 spec limits. Flag violations in red. Show min/avg/max timing statistics. |
| Command filtering | Filter message list by command type, by session, by time range. Essential when capturing busy environments with thousands of commands per second. | MEDIUM | Wireshark-style display filter. At minimum: filter by command type dropdown. Advanced: expression-based filtering on any decoded field. |
| Frequency hopping visualization | UHF RFID readers hop across channels. Show which channel the reader is on over time. Combines waterfall view with protocol decode timeline. | HIGH | Detect channel transitions in waterfall. Correlate with decoded commands. Show channel usage pattern. Limited by RTL-SDR bandwidth (can only see ~2.4 MHz at once, but can show activity within that window). |

#### Polish and Workflow

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Quick-reference EPC Gen2 command docs | Hover over a command type to see its definition and field layout from the Gen2 spec. No need to open the 700-page standard PDF. | LOW | Static reference data compiled from the public Gen2 specification. Tooltip or sidebar reference panel. |
| Dark mode UI | Engineers often work in RF-shielded rooms or labs with dim lighting. Dark mode reduces eye strain and is standard in SDR tools (SDR#, GQRX both default dark). | LOW | Design dark-first. SDR/spectrum displays look better on dark backgrounds anyway. Make it the default. |
| Keyboard shortcuts for capture control | Start/stop capture, pause scrolling, navigate messages. Power users expect keyboard-driven workflows. | LOW | Space = start/stop, arrow keys = navigate messages, Escape = clear selection, F = toggle filter panel. |
| Signal strength indicator | Show current peak signal strength in the RFID band. Quick visual feedback that the antenna is receiving reader signals before diving into protocol decode. | LOW | Peak power meter in the RFID frequency range. Green/yellow/red zones. Helps users position their antenna. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this specific project.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Tag inventory / tracking | "I want to see which tags are being read" | This is a reader function, not a protocol analyzer function. The tool passively listens -- it does not transmit. RTL-SDR is receive-only. Attempting to build reader functionality confuses the product identity and is technically impossible with RTL-SDR. | Decode tag responses (backscatter) where signal allows, show them in the protocol timeline as responses to reader commands. But do not promise reliable tag inventory. |
| Full tag backscatter decoding (as primary feature) | "I want to see both sides of the conversation" | RTL-SDR at 2.4 MSPS has severe limitations for backscatter: tag responses are 20-40 dB weaker than reader commands, FM0/Miller modulation requires precise carrier recovery, and bandwidth may be insufficient. Promising this and under-delivering damages credibility. | Attempt backscatter decode as best-effort. Show it when detected. Clearly label confidence level. Never position it as a primary feature. |
| Session recording and replay | "I want to save captures for later analysis" | Adds significant complexity: file format design, storage management, replay engine, timeline scrubbing UI. Doubles the architecture surface area for v1. | Defer to v2. For v1, the value is live analysis. If users need to save, they can screenshot or note timestamps. |
| Post-capture analysis tools (statistics, reports, export) | "I want to export to CSV/PDF" | Scope explosion. Each export format is a maintenance burden. Statistics require accumulation buffers and a different UI paradigm than live streaming. | Defer to v2. v1 validates that live decode works and is useful. |
| Multi-SDR support (HackRF, Airspy, etc.) | "Support my hardware" | Each SDR has different USB protocols, sample formats, and capabilities. WebUSB implementations differ. Supporting multiple hardware platforms fragments testing effort and introduces compatibility bugs. | RTL-SDR V3/V4 only for v1. Most common, cheapest (~$30), best WebUSB library support. Evaluate multi-SDR in v2 based on demand. |
| Mobile / tablet support | "I want to use it on my iPad" | WebUSB is not available on iOS (Safari). Android Chrome supports WebUSB but touch interactions for spectrum/waterfall are complex. Small screens make protocol detail views unusable. | Desktop browser only. State this clearly. Do not invest in responsive layouts for spectrum displays. |
| Plugin / extension system | "Let me add my own decoders" | Premature abstraction. The protocol decoder architecture needs to mature first. Plugin APIs create backward-compatibility obligations. | Build a clean, modular internal architecture. If demand exists post-v1, expose extension points in v2. |
| Transmission / tag emulation | "I want to send commands" | RTL-SDR is receive-only hardware. Cannot transmit. Adding transmit support requires different hardware (HackRF, USRP) which contradicts the RTL-SDR-only scope. | Out of scope. This is a passive listener/analyzer only. |
| Real-time tag-to-reader association | "Show me which tags responded to which queries" | Requires reliable backscatter decoding (problematic with RTL-SDR) AND correlation logic AND state tracking. Very complex, very fragile with limited hardware. | Show reader commands reliably. Show backscatter attempts as best-effort annotations. Do not promise reliable association. |

## Feature Dependencies

```
[WebUSB RTL-SDR Connection]
    |
    +---> [Sample Streaming]
              |
              +---> [FFT / Spectrum Display]
              |         |
              |         +---> [Waterfall Display]
              |         |
              |         +---> [Signal Strength Indicator]
              |
              +---> [PIE Signal Detection]
                        |
                        +---> [PIE Symbol Decoding]
                                  |
                                  +---> [Command Parsing (Gen2)]
                                            |
                                            +---> [Message List / Timeline]
                                            |         |
                                            |         +---> [Color Coding by Type]
                                            |         |
                                            |         +---> [Message Detail Panel]
                                            |         |
                                            |         +---> [Command Filtering]
                                            |         |
                                            |         +---> [Timing Analysis]
                                            |
                                            +---> [Raw Bits / Symbols View]
                                            |
                                            +---> [Inventory Round Grouping]
                                            |         |
                                            |         +---> [Inventory Round Visualization]
                                            |
                                            +---> [Backscatter Decode (best-effort)]

[Region Presets] --enhances--> [Center Frequency Tuning]
[Gain Control] --enhances--> [PIE Signal Detection]
[Dark Mode] --independent-- (no dependencies)
[Shareable URL] --enhances--> [All settings controls]
[Quick-reference Docs] --enhances--> [Message Detail Panel]
[Keyboard Shortcuts] --enhances--> [Capture Control, Message Navigation]
```

### Dependency Notes

- **PIE Signal Detection requires Sample Streaming:** Cannot decode protocol without raw IQ samples flowing from the SDR.
- **Command Parsing requires PIE Symbol Decoding:** Must extract bit stream before parsing Gen2 command structures.
- **Inventory Round Grouping requires Command Parsing:** Must know command types to identify Query boundaries.
- **Timing Analysis requires Message List + Command Parsing:** Need both timestamps and parsed commands to calculate inter-command timing.
- **Waterfall Display requires FFT:** Waterfall is just spectrum-over-time; needs the FFT pipeline.
- **Backscatter Decode requires Command Parsing:** Need to know when to expect tag responses (after ACK, Read, etc.) to search for FM0/Miller modulation in the right time windows.
- **Message Detail Panel requires both Command Parsing and Raw Bits View:** Shows parsed fields alongside raw bit representation.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what is needed to validate that browser-based RFID protocol analysis is useful and feasible.

- [ ] **WebUSB RTL-SDR connection** -- without hardware access, nothing works
- [ ] **Region presets + frequency/gain controls** -- users must configure for their environment
- [ ] **Live spectrum display (FFT)** -- visual confirmation that RF signals are being received
- [ ] **Waterfall display** -- shows signal activity over time, essential for spotting reader transmissions
- [ ] **PIE envelope detection and symbol decoding** -- extract digital bits from RF signal
- [ ] **EPC Gen2 command parsing (all 11 mandatory commands)** -- the core value: decoded protocol messages
- [ ] **Message list with timestamps and inter-command timing** -- scrolling timeline of decoded activity
- [ ] **Color coding by command type** -- visual differentiation in the message list
- [ ] **Message detail panel** -- click to see full command structure and parameters
- [ ] **Raw bits view** -- show PIE symbols alongside decoded commands
- [ ] **Start/stop capture control** -- basic lifecycle management
- [ ] **Signal strength indicator** -- quick feedback on antenna positioning
- [ ] **Dark mode UI** -- design dark-first, standard for SDR tools

### Add After Validation (v1.x)

Features to add once core live decode is working and validated with real hardware.

- [ ] **Command filtering** -- add when message volumes are high enough to need it
- [ ] **Inventory round visualization** -- add when basic command decode is solid and engineers request round-level analysis
- [ ] **Reader timing analysis with spec-limit checking** -- add when engineers are actively using the tool for reader optimization
- [ ] **Frequency hopping visualization** -- add when waterfall correlation with decoded commands is working
- [ ] **Backscatter decode (best-effort, FM0)** -- add after forward-link decode is reliable; clearly label as experimental
- [ ] **Quick-reference Gen2 command docs** -- add as contextual help once the detail panel exists
- [ ] **Shareable URL with settings** -- add as a convenience feature once settings are stable
- [ ] **Keyboard shortcuts** -- add based on observed usage patterns

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Session recording and replay** -- complex architecture change; defer until live mode is validated
- [ ] **Export (CSV, JSON, screenshot)** -- defer until data model is stable
- [ ] **Post-capture statistics and reports** -- defer; requires different UI paradigm
- [ ] **Gen2v3 command support (QueryX, QueryY)** -- defer until Gen2v3 readers are common in the field
- [ ] **Multi-SDR hardware support** -- defer unless strong demand for specific hardware
- [ ] **Configurable FFT parameters (window function, overlap, averaging)** -- defer; use sensible defaults for v1

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| WebUSB RTL-SDR connection | HIGH | MEDIUM | P1 |
| Region presets | HIGH | LOW | P1 |
| Gain / frequency controls | HIGH | LOW | P1 |
| Live spectrum display (FFT) | HIGH | HIGH | P1 |
| Waterfall display | HIGH | HIGH | P1 |
| PIE signal detection + decode | HIGH | HIGH | P1 |
| Gen2 command parsing | HIGH | HIGH | P1 |
| Message list + timestamps | HIGH | MEDIUM | P1 |
| Color coding by type | MEDIUM | LOW | P1 |
| Message detail panel | HIGH | MEDIUM | P1 |
| Raw bits view | MEDIUM | MEDIUM | P1 |
| Start/stop capture | HIGH | LOW | P1 |
| Signal strength indicator | MEDIUM | LOW | P1 |
| Dark mode | MEDIUM | LOW | P1 |
| Command filtering | HIGH | MEDIUM | P2 |
| Inventory round visualization | HIGH | HIGH | P2 |
| Timing analysis + spec checking | HIGH | HIGH | P2 |
| Frequency hopping visualization | MEDIUM | HIGH | P2 |
| Backscatter decode (best-effort) | MEDIUM | HIGH | P2 |
| Quick-reference Gen2 docs | LOW | LOW | P2 |
| Shareable URL | LOW | LOW | P2 |
| Keyboard shortcuts | LOW | LOW | P2 |
| Session recording / replay | MEDIUM | HIGH | P3 |
| Export (CSV/JSON) | MEDIUM | MEDIUM | P3 |
| Post-capture statistics | MEDIUM | HIGH | P3 |
| Gen2v3 support | LOW | MEDIUM | P3 |
| Multi-SDR hardware | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch -- defines the core product experience
- P2: Should have, add after core validation -- deepens value for power users
- P3: Nice to have, future consideration -- scope expanders for product growth

## Competitor Feature Analysis

| Feature | Voyantic Protocol Analyzer | GNU Radio Gen2 Reader | SDR# / GQRX | OpenWebRX | Our Approach |
|---------|---------------------------|----------------------|-------------|-----------|--------------|
| **Cost** | $10K+ (hardware + license) | Free (complex setup) | Free | Free | Free, zero-install |
| **Install** | Dedicated hardware + Windows software | GNU Radio + USRP ($300+) + build blocks | Download + install + driver | Server install + config | Open browser, plug in $30 dongle |
| **Spectrum display** | Yes (waveform view) | Via GNU Radio GUI | Excellent | Excellent (web-based) | Yes, browser-native |
| **Waterfall** | Limited | Via GNU Radio | Excellent | Excellent | Yes, WebGL-rendered |
| **Gen2 command decode** | Full (Gen2v2/v3) | Partial (research code) | None | None | Full Gen2v2 mandatory set |
| **Timing analysis** | Excellent (key feature) | Manual | None | None | Basic in v1, deep in v1.x |
| **Inventory round view** | Yes (graphical) | No | None | None | v1.x feature |
| **Tag backscatter** | Yes (dedicated receiver) | Yes (with USRP TX/RX) | None | None | Best-effort only (RTL-SDR limitation) |
| **Filtering** | Basic | None | N/A | N/A | v1.x (by command type) |
| **Cross-platform** | Windows only | Linux primarily | Windows (SDR#) / Linux+Mac (GQRX) | Any browser (remote) | Any Chrome/Edge browser |
| **Target user** | RFID test engineers, QA | Researchers, academics | Radio hobbyists | Radio hobbyists | RFID engineers, developers |
| **Learning curve** | Moderate (proprietary UI) | Very high (GNU Radio) | Moderate | Low (but no RFID decode) | Low (browser, guided presets) |

### Competitive Positioning

The tool sits in a gap that no existing product fills:
- **Voyantic** has the features but costs $10K+ and requires dedicated hardware
- **GNU Radio** has the signal processing but requires deep DSP expertise and complex setup
- **SDR#/GQRX** have great spectrum UIs but zero RFID protocol awareness
- **OpenWebRX** proves browser-based SDR works but has no protocol decode

Our product combines "browser-based SDR visualization" (proven by OpenWebRX) with "RFID protocol decode" (proven by Voyantic/GNU Radio) at zero cost with zero install.

## Sources

- [GS1 EPC Gen2 Standard](https://www.gs1.org/standards/rfid/uhf-air-interface-protocol) -- Protocol specification
- [Voyantic Protocol Analyzer](https://voyantic.com/lab/protocol-analyzer/) -- Commercial RFID analyzer features
- [Gen2-UHF-RFID-Reader (GitHub)](https://github.com/nkargas/Gen2-UHF-RFID-Reader) -- Open source GNU Radio Gen2 decoder
- [Wireshark Color Rules](https://wiki.wireshark.org/ColoringRules) -- Protocol analyzer UX patterns
- [Wireshark Display Filters](https://wiki.wireshark.org/DisplayFilters) -- Filtering UX patterns
- [GQRX SDR](https://www.gqrx.dk/) -- Desktop SDR UI reference
- [SDRSharp Users Guide](https://www.rtl-sdr.com/sdrsharp-users-guide/) -- SDR# features reference
- [OpenWebRX](https://www.openwebrx.de/) -- Browser-based SDR reference implementation
- [rtlsdrjs (GitHub)](https://github.com/sandeepmistry/rtlsdrjs) -- WebUSB RTL-SDR library
- [webrtlsdr (GitHub)](https://github.com/jtarrio/webrtlsdr) -- Alternative WebUSB RTL-SDR library
- [Building a Signal Analyzer with Modern Web Tech](https://cprimozic.net/blog/building-a-signal-analyzer-with-modern-web-tech/) -- Browser-based signal processing techniques
- [RFID4U Gen2 Commands](https://rfid4u.com/epc-gen2-reader-commands-and-q-parameter/) -- Gen2 command reference
- [EPC Gen2v3 Protocol](https://voyantic.com/blog/posts/epc-gen2-uhf-rfid-standard-v3-whats-changed-and-tips-for-hands-on-testing/) -- Gen2v3 updates
- [CISC RFID Xplorer](https://www.cisc.at/references/reader-testing/) -- Conformance testing tool reference

---
*Feature research for: Browser-based UHF RFID protocol analyzer*
*Researched: 2026-03-19*
