# Pitfalls Research

**Domain:** Browser-based UHF RFID protocol analyzer (RTL-SDR via WebUSB)
**Researched:** 2026-03-19
**Confidence:** HIGH (verified across multiple implementation reports, official specs, and community experience)

## Critical Pitfalls

### Pitfall 1: Main Thread DSP Starvation

**What goes wrong:**
Signal processing (FFT, demodulation, PIE decoding) runs on the main thread, blocking the UI rendering loop. The browser becomes unresponsive -- spectrum display freezes, decoded messages stop scrolling, and the user thinks the app has crashed. At 2.4 MSPS with 8-bit I/Q samples, the RTL-SDR produces ~4.8 MB/s of raw data. Processing this on the main thread with JavaScript will stall requestAnimationFrame callbacks within seconds.

**Why it happens:**
JavaScript is single-threaded. Developers prototype DSP in the main thread because it is simpler -- no message passing, no shared memory coordination. It works with small test buffers but fails catastrophically under real-time data rates. The problem is invisible until you connect real hardware.

**How to avoid:**
Architect a multi-threaded pipeline from day one:
- **USB I/O thread** (Web Worker): Reads bulk transfers from RTL-SDR via WebUSB, writes raw I/Q into a SharedArrayBuffer ring buffer.
- **DSP thread** (Web Worker or AudioWorklet): Reads from ring buffer, performs FFT, demodulation, and protocol decoding. Writes results (spectrum bins, decoded messages) to output SharedArrayBuffers.
- **Main thread**: Only reads processed results and renders UI. Never touches raw samples.

Use SharedArrayBuffer + Atomics for zero-copy data sharing between threads. This requires COOP/COEP headers (see Pitfall 5).

**Warning signs:**
- UI frame rate drops below 30fps when receiving samples
- "Page unresponsive" dialogs from Chrome
- Spectrum display updates in jerky bursts rather than smoothly
- Decoded message timestamps show gaps

**Phase to address:**
Phase 1 (Foundation/Architecture). The threading model must be the very first thing built. Retrofitting threading into a single-threaded prototype requires rewriting nearly everything.

---

### Pitfall 2: RTL-SDR Sample Drops via WebUSB

**What goes wrong:**
The application loses USB bulk transfer packets, creating gaps in the I/Q sample stream. These gaps corrupt FFT output (spectral artifacts), break demodulation state machines (false triggers or missed commands), and make protocol decoding unreliable. The RTL2832U uses asynchronous bulk transfers with 15 in-flight transfers by default. If the application does not read completed transfers fast enough, the internal ring buffer overflows and samples are silently discarded.

**Why it happens:**
WebUSB adds a layer of abstraction over native USB access. Unlike librtlsdr which uses libusb with tight callback loops in native code, WebUSB bulk transfers go through the browser's USB stack, involving Promise resolution, potential GC pauses, and event loop scheduling. The browser may also throttle USB activity when the tab is not focused. At 2.4 MSPS, you need to sustain ~4.8 MB/s of continuous USB reads with no gaps.

**How to avoid:**
- Run all WebUSB bulk transfer reads in a dedicated Web Worker, never on the main thread.
- Use large transfer sizes (16384 bytes or 32768 bytes, must be multiples of 512) to reduce per-transfer overhead.
- Implement a ring buffer with overwrite semantics so the USB reader never blocks waiting for the consumer.
- Add a dropped-sample counter: check for discontinuities in the sample stream (the RTL2832U does not provide sequence numbers, so monitor for sudden amplitude jumps or timing gaps).
- Request only 2.048 MSPS or 2.4 MSPS -- do not push to 3.2 MSPS via WebUSB. Native librtlsdr can sometimes sustain 2.56 MSPS but WebUSB has higher overhead.
- Warn users if the tab loses focus (background tabs get throttled).

**Warning signs:**
- Spectrum display shows periodic "spikes" or artifacts that are not real signals
- Decoded commands have CRC errors that correlate with time gaps
- `rtl_test` equivalent shows dropped bytes

**Phase to address:**
Phase 1 (WebUSB/Hardware Integration). Must be validated with real hardware before building any DSP pipeline on top.

---

### Pitfall 3: Misunderstanding RTL-SDR Bandwidth vs. UHF RFID Channel Structure

**What goes wrong:**
Developers assume the RTL-SDR's ~2.4 MHz bandwidth is insufficient for UHF RFID, or conversely, assume it can capture frequency-hopping reader behavior across the full 902-928 MHz US band. Both are wrong, leading to either abandoning the project prematurely or building features that cannot work.

**Why it happens:**
UHF RFID readers frequency-hop across 50+ channels (US: 902-928 MHz, 500 kHz spacing). The RTL-SDR can only see ~2 MHz at a time. However, a single RFID reader-to-tag exchange on one channel occupies only ~200-500 kHz of bandwidth (PIE modulation at typical Tari values). The RTL-SDR is perfectly adequate for monitoring a single channel or a small group of adjacent channels, but it cannot follow a hopping reader.

**How to avoid:**
- Design the UI around single-channel monitoring from the start. The user selects a center frequency or channel, and the tool shows what happens on that channel.
- Set correct expectations: the tool will capture reader commands that happen to occur on the tuned channel. With 50 US channels, roughly 1/50th of transmissions will be visible at any time.
- For EU (865-868 MHz, 4 channels of 200 kHz), the RTL-SDR can actually see the entire band simultaneously -- this is a significant advantage to highlight.
- Add channel presets for both US and EU regions with clear labeling of what the bandwidth covers.
- Consider implementing a "channel scan" mode that hops the tuner across channels, but be honest that this introduces gaps.

**Warning signs:**
- Users report "I can only see a few commands" when the reader is hopping
- Feature requests for "capture all channels simultaneously"
- Confusion about why EU mode works better than US mode

**Phase to address:**
Phase 2 (DSP/Spectrum). The channel model must be established before building the spectrum display and demodulator.

---

### Pitfall 4: Incorrect PIE Timing Threshold Assumptions

**What goes wrong:**
The PIE (Pulse Interval Encoding) decoder uses hardcoded timing thresholds to distinguish data-0 (1 Tari duration) from data-1 (1.5-2.0 Tari duration). When encountering readers with different Tari values (6.25us to 25us per spec) or non-standard timing, the decoder fails silently -- it produces garbage bits that look plausible but are wrong.

**Why it happens:**
Developers test with one reader that uses a specific Tari (often 12.5us or 25us) and hardcode thresholds around that value. The EPC Gen2 spec allows Tari from 6.25us to 25us, and the data-1/data-0 ratio can be anywhere from 1.5x to 2.0x. Different reader manufacturers use different values. The +/-1% tolerance spec sounds tight, but in practice, after ADC sampling and processing, the measured pulse widths have much more jitter.

**How to avoid:**
- Implement adaptive Tari detection: measure the preamble/frame-sync pattern at the start of each reader transmission to determine the actual Tari value being used.
- The EPC Gen2 preamble contains a known pattern (delimiter + data-0 + RT calibration symbol) that encodes the Tari and data-1/data-0 ratio. Use this to self-calibrate on every transmission.
- Use ratio-based thresholds (e.g., if measured duration > 1.25x Tari, classify as data-1) rather than absolute microsecond thresholds.
- Log the detected Tari and ratio values in the UI so engineers can verify correct detection.
- Test with at least 3 different reader manufacturers.

**Warning signs:**
- Decoded commands have valid structure but nonsensical parameter values
- CRC checks fail on decoded commands even when the signal is strong and clean
- Decoder works with one reader but not another

**Phase to address:**
Phase 3 (Protocol Decoding). This is the core decoding logic and must be implemented with adaptive detection from the start.

---

### Pitfall 5: COOP/COEP Header Requirements for SharedArrayBuffer

**What goes wrong:**
The application deploys without Cross-Origin-Opener-Policy (COOP) and Cross-Origin-Embedder-Policy (COEP) headers. SharedArrayBuffer is unavailable, breaking the entire multi-threaded architecture. The app falls back to slow postMessage-based data transfer between threads, which cannot sustain real-time data rates. Or worse, the developer never uses SharedArrayBuffer and builds an architecture that copies megabytes of data between threads via structured clone, which is too slow.

**Why it happens:**
Browsers require cross-origin isolation to enable SharedArrayBuffer (a Spectre mitigation since 2018). This means the server must send specific HTTP headers:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Developers working with `localhost` during development (where SharedArrayBuffer often works without headers) do not discover this until deployment. Additionally, COEP requires that ALL sub-resources are loaded with appropriate CORP/CORS headers, which can break third-party scripts, analytics, or CDN resources.

**How to avoid:**
- Set COOP/COEP headers from day one, even in local development.
- Configure your dev server (Vite, webpack-dev-server, etc.) to include these headers.
- Avoid third-party scripts that do not support CORP/CORS (analytics, ads, external fonts from non-CORS CDNs).
- Test SharedArrayBuffer availability on first load and show a clear error if unavailable: "This application requires cross-origin isolation. Your server configuration may be incorrect."
- If deploying to GitHub Pages, note that you CANNOT set custom headers -- you would need a service worker workaround (coi-serviceworker) or a different hosting solution.

**Warning signs:**
- `SharedArrayBuffer is not defined` errors in console
- Application works on localhost but breaks when deployed
- Third-party resources fail to load after adding COEP headers

**Phase to address:**
Phase 1 (Project Setup/Infrastructure). Must be configured before any threading code is written.

---

### Pitfall 6: Treating Tag Backscatter Decoding as Equivalent to Reader Command Decoding

**What goes wrong:**
The project scopes tag backscatter (FM0/Miller) decoding as a peer feature to reader command decoding, allocating similar effort. In reality, backscatter decoding with an RTL-SDR is an order of magnitude harder and may be impossible in many real-world scenarios. The project either wastes significant time on an unreliable feature or ships with a broken backscatter decoder that undermines user trust in the entire tool.

**Why it happens:**
The forward link (reader-to-tag) is a high-power ASK/PIE modulated signal that is easy to receive with an RTL-SDR. The return link (tag backscatter) is a passive reflection of the reader's carrier, modulated by the tag's impedance switching. The backscatter signal is typically 60-80 dB weaker than the reader's transmission. The RTL-SDR's 8-bit ADC has only ~48 dB of dynamic range, meaning the backscatter signal may be below the noise floor when the reader's strong signal is present. Additionally, FM0 at 640 kbps BLF (backscatter link frequency) creates sidebands at +/- 320 kHz from the carrier, which mix with the reader's own modulation.

**How to avoid:**
- Scope backscatter decoding as "experimental/best-effort" from the start, not a core feature.
- Build the entire v1 around reader command decoding only. This alone is extremely valuable to RFID engineers.
- If attempting backscatter: require the RTL-SDR to be positioned very close to the tag (< 1m), with a directional antenna pointing at the tag, not the reader.
- Consider that backscatter decoding may only work with Miller-4 subcarrier (which spreads the signal into narrower, higher-energy sidebands) rather than FM0.
- Display backscatter attempts with confidence indicators so users know the decode quality.

**Warning signs:**
- Backscatter decoder produces results only in lab conditions with reader 30cm away
- Users report "tag responses never appear"
- Significant development time being invested with no reliable real-world results

**Phase to address:**
Phase 4 or later (Advanced Features). Do not attempt before reader command decoding is solid and validated.

---

### Pitfall 7: WebUSB Device Claim Failures Across Platforms

**What goes wrong:**
Users cannot connect to their RTL-SDR because the browser fails to claim the USB interface. The error message ("Failed to claim interface: Access denied") is misleading -- it is not a permissions problem but a driver conflict. On Windows, the generic WinUSB or DVB-T driver has already claimed the device. On Linux, the kernel's dvb_usb_rtl28xxu module has loaded. On macOS, a kernel extension may hold the device.

**Why it happens:**
WebUSB requires exclusive access to a USB interface. If any other driver or application has already claimed that interface, the browser cannot access it. Unlike native SDR software (SDR#, GQRX) which use tools like Zadig (Windows) or blacklist kernel modules (Linux) to work around this, browser-based applications cannot instruct the OS to release the device. Users unfamiliar with SDR software will not know about driver replacement.

**How to avoid:**
- Build a comprehensive "connection troubleshooting" guide directly into the app UI, not just docs.
- On connection failure, detect the platform (navigator.platform) and show platform-specific instructions:
  - **Windows:** "Install WinUSB driver using Zadig. Select your RTL-SDR, replace driver with WinUSB."
  - **Linux:** "Unload the kernel module: `sudo modprobe -r dvb_usb_rtl28xxu`"
  - **macOS:** "Disconnect and reconnect the device. Close any other SDR applications."
- Implement the connect flow with clear state feedback: "Requesting device..." -> "Opening device..." -> "Claiming interface..." -> "Configuring..." so users know exactly where it fails.
- Handle the disconnect event (`navigator.usb.ondisconnect`) gracefully -- show reconnection UI, do not crash.
- After disconnect+reconnect, previous device references are invalid. You must re-request and re-open the device.

**Warning signs:**
- GitHub issues dominated by "can't connect" reports
- Users on Windows cannot connect at all without prior SDR experience
- Random disconnects cause app to crash or hang

**Phase to address:**
Phase 1 (WebUSB/Hardware Integration). The connection flow is the first thing users experience and must be robust.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single-threaded prototype | Faster initial development | Complete rewrite needed for real-time performance; architecture cannot be incrementally migrated | Never -- the threading model must be established in Phase 1 |
| Hardcoded Tari/timing values | Works with your specific test reader | Fails with other readers, no adaptive behavior | Only for initial proof-of-concept testing, must be replaced before any user testing |
| postMessage for inter-thread data | Avoids SharedArrayBuffer/COOP/COEP complexity | Structured clone copies megabytes per second; at 4.8 MB/s it adds ~50ms latency per transfer, breaking real-time | Never for sample data; acceptable for decoded message objects (small, infrequent) |
| Canvas 2D for spectrum/waterfall | Simpler API, familiar to most web devs | CPU-bound rendering bottleneck at high update rates; waterfall scrolling requires full canvas redraw each frame | Acceptable for initial prototype; migrate to WebGL when adding waterfall |
| Ignoring sample drops | Simpler code, no error handling | Users get wrong decoding results and do not know why; undermines trust in the tool | Never -- at minimum log/display a dropped sample counter |
| Skip CRC validation on decoded commands | Faster to ship decoder | Users cannot distinguish correct decodes from corrupted ones; tool produces unreliable data | Never -- CRC is essential for a protocol analyzer |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| WebUSB + RTL-SDR | Calling `claimInterface()` before `open()` and `selectConfiguration()` | Sequence must be: `requestDevice()` -> `open()` -> `selectConfiguration(1)` -> `claimInterface(0)` -> `controlTransferOut()` for RTL2832U init |
| WebUSB bulk transfers | Using small transfer sizes (512 bytes) causing excessive Promise overhead | Use 16384+ byte transfers; each transfer resolves one Promise. Fewer, larger transfers = less scheduling overhead |
| RTL2832U register init | Copying init sequences from librtlsdr without understanding them | The RTL2832U requires specific register writes for: crystal frequency, sample rate, gain mode, IF frequency, AGC. Get these wrong and you get noise or silence. Use webrtlsdr (jtarrio/webrtlsdr) as reference -- it is actively maintained and TypeScript |
| SharedArrayBuffer + Atomics | Using `Atomics.wait()` on the main thread | `Atomics.wait()` blocks and is forbidden on the main thread (throws TypeError). Use `Atomics.waitAsync()` on main thread, or design so main thread only reads (never waits) |
| Web Workers + WebUSB | Assuming WebUSB is available in Web Workers | WebUSB is ONLY available on the main thread (requires `navigator.usb`). You must open the device on the main thread, then transfer data to workers. Some implementations use `postMessage` to send transferIn results to a worker |
| R820T2 tuner | Setting frequency without accounting for IF offset | The R820T2 tuner uses an intermediate frequency. The actual tuner frequency = desired_frequency - IF_frequency. Get this wrong and you are tuned ~3.57 MHz off |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| FFT on every sample buffer | CPU usage hits 100%, UI freezes | Decimate before FFT. At 2.4 MSPS with 2048-point FFT, you get ~1172 FFTs/second. You only need 30-60/second for display. Average or decimate to reduce load | Immediately at full sample rate |
| Waterfall redraw from scratch each frame | Waterfall rendering consumes >16ms per frame, dropping below 60fps | Use WebGL texture scrolling: shift existing texture down by one row, write new FFT row at top. Never redraw the full waterfall | Beyond ~256 pixel-high waterfall at 30fps |
| Creating new TypedArray views per sample buffer | GC pressure causes periodic 10-50ms pauses, visible as spectrum stuttering | Pre-allocate TypedArray views at init. Reuse buffers. In WASM, use a fixed memory region | After ~30 seconds of continuous processing |
| Spectrum smoothing with full history | Storing N frames of FFT history for averaging; memory grows linearly | Use exponential moving average (single buffer, alpha blend each new frame). O(1) memory regardless of history length | After a few minutes of operation |
| Decoded message list grows without bound | DOM node count increases, rendering slows, eventually tab crashes | Virtualize the message list (only render visible rows). Cap stored messages at ~10000, discard oldest. Use a ring buffer for message storage | After ~5 minutes of active decoding |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Not validating USB device vendor/product ID | User could grant access to a non-RTL-SDR device; malformed USB responses could crash the app or cause undefined behavior | Filter `requestDevice()` with `{ filters: [{ vendorId: 0x0bda, productId: 0x2838 }] }` for RTL2832U. Validate device descriptor after opening |
| Trusting decoded RFID data for display without sanitization | EPC memory banks can contain arbitrary bytes; if rendered as HTML, potential XSS via crafted tag data | Always render decoded data as text content, never innerHTML. Use monospace pre-formatted display for hex/binary |
| Running with permissive CORS in production | Opens the application to cross-origin attacks; COEP requires careful resource policy | Set proper COOP/COEP headers; audit all external resources for CORP compatibility; avoid inline scripts that violate CSP |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No connection state feedback | User clicks "Connect" and sees nothing for 2-3 seconds while USB negotiation happens; assumes it failed, clicks again | Show a multi-step progress indicator: "Requesting device..." -> "Opening..." -> "Configuring tuner..." -> "Starting capture...". Each step takes 100-500ms |
| Spectrum display without signal reference | User sees a noisy spectrum and cannot tell if they are receiving real RFID signals or just noise floor | Show noise floor reference line. Highlight signal peaks above a configurable threshold. Show "No RFID signals detected" when the decoder sees no valid preambles |
| Decoded messages without context | Raw decoded fields (e.g., "Query: DR=8, M=FM0, TRext=0, Sel=All, Session=S0, Target=A, Q=4") are meaningless to most users | Add human-readable annotations: "Query: Requesting tags in Session 0, expecting ~16 tags (Q=4), using FM0 backscatter". Provide hover tooltips explaining each field |
| No indication of channel coverage | Users do not understand what portion of the RFID band they are monitoring | Show a band plan overlay on the spectrum display marking all RFID channels, with the current tuning highlighted. Show "Monitoring channel 5 of 50 (US)" |
| Auto-scroll that cannot be paused | Message list auto-scrolls as new commands arrive; user cannot examine a specific command | Auto-scroll when scrolled to bottom; stop auto-scrolling when user scrolls up. Show "N new messages" badge. Click to resume auto-scroll |

## "Looks Done But Isn't" Checklist

- [ ] **WebUSB connection:** Often missing reconnection handling -- verify the app recovers gracefully when the USB cable is unplugged and re-plugged during capture
- [ ] **Spectrum display:** Often missing proper dBFS scaling -- verify the Y-axis shows calibrated power levels, not arbitrary FFT magnitudes. Without a window function (Hann, Blackman-Harris), spectral leakage makes signals look 20dB wider than reality
- [ ] **PIE decoder:** Often missing support for variable Tari -- verify it works with Tari=6.25us, 12.5us, and 25us from different readers, not just the one on your bench
- [ ] **Command decoder:** Often missing CRC-16 validation -- verify every decoded command is CRC-checked and invalid commands are flagged, not silently displayed as valid
- [ ] **FM0/Miller decoder:** Often claims to work but only tested with simulated data -- verify with actual over-the-air captures. Simulated signals lack noise, frequency offset, and timing jitter
- [ ] **Message timestamps:** Often using wall-clock time instead of sample-count-based time -- verify timestamps have microsecond precision based on sample position, not Date.now() which has millisecond granularity at best
- [ ] **Gain control:** Often missing AGC or manual gain adjustment -- verify the app allows the user to set RTL-SDR gain (0-50dB) and that the spectrum display updates accordingly. Auto-gain mode often oscillates with strong RFID signals

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Main thread DSP (Pitfall 1) | HIGH | Requires full architecture rewrite. Extract all DSP into Web Worker modules. Implement SharedArrayBuffer ring buffer. Re-plumb data flow. Essentially start over on the data pipeline |
| Sample drops (Pitfall 2) | MEDIUM | Add monitoring first (drop counter). Then increase transfer sizes, move USB reads to worker, add ring buffer. May require adjusting sample rate downward |
| Wrong bandwidth assumptions (Pitfall 3) | LOW | UI/documentation change. Add channel indicators and region presets. No architecture change needed |
| Hardcoded PIE timing (Pitfall 4) | MEDIUM | Refactor decoder to extract Tari from preamble. Replace absolute thresholds with ratio-based. Requires rewriting the synchronization/detection front-end of the decoder |
| Missing COOP/COEP (Pitfall 5) | LOW-MEDIUM | Add headers to server config. May break third-party resources that need to be replaced or proxied. If using GitHub Pages, need to add coi-serviceworker or move hosting |
| Over-scoped backscatter (Pitfall 6) | MEDIUM-HIGH | If significant code was written, it may be salvageable as "experimental" feature. Main cost is lost development time. No architecture damage if it was properly isolated |
| USB claim failures (Pitfall 7) | LOW | Add error handling, platform detection, and troubleshooting UI. No architecture change, purely UX work |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Main thread DSP starvation | Phase 1: Architecture | Run a "stress test" page that receives 2.4 MSPS of dummy data through the full pipeline while measuring main thread frame rate. Must stay above 50fps |
| RTL-SDR sample drops | Phase 1: WebUSB Integration | Connect real RTL-SDR, run at 2.4 MSPS for 60 seconds, verify zero dropped samples via counter. Test with tab in background |
| Bandwidth misconceptions | Phase 2: Spectrum Display | UI clearly shows tuned bandwidth relative to RFID band. Channel indicators visible. Documentation accurate |
| PIE timing hardcoding | Phase 3: Protocol Decoder | Test with 3+ different Tari values (6.25, 12.5, 25 us). If possible, test with 2+ reader manufacturers |
| COOP/COEP headers | Phase 1: Project Setup | SharedArrayBuffer available in deployed (non-localhost) environment. Verify with `crossOriginIsolated` global property |
| Backscatter over-scoping | Phase 3-4: Planning | Backscatter marked as experimental in UI. Core value validated without backscatter. Backscatter only attempted after reader decode is solid |
| USB claim failures | Phase 1: WebUSB Integration | Test connection flow on Windows (with/without Zadig), Linux (with/without kernel module), macOS. All failures show actionable guidance |

## Sources

- [Hackaday: RTL-SDR With Only A Browser (2025)](https://hackaday.com/2025/03/23/rtl-sdr-with-only-a-browser/)
- [Hacker News: HTML5 RTL-SDR Discussion](https://news.ycombinator.com/item?id=42353390) -- community reports on WebUSB limitations, driver conflicts, browser-only restrictions
- [FutureSDR: Full ZigBee SDR Receiver in the Browser](https://www.futuresdr.org/blog/wasm-zigbee/) -- architecture decisions for browser-based SDR, threading model, performance benchmarks
- [jtarrio/webrtlsdr](https://github.com/jtarrio/webrtlsdr) -- actively maintained WebUSB RTL-SDR library in TypeScript, reference implementation
- [sandeepmistry/rtlsdrjs](https://github.com/sandeepmistry/rtlsdrjs) -- original WebUSB RTL-SDR library, dormant since 2018 (avoid as dependency)
- [Casey Primozic: AudioWorklet Performance Pitfall](https://cprimozic.net/blog/webaudio-audioworklet-optimization/) -- GC pauses in audio/DSP worklets
- [web.dev: Cross-Origin Isolation with COOP/COEP](https://web.dev/articles/coop-coep) -- SharedArrayBuffer requirements
- [Chrome: SharedArrayBuffer Updates](https://developer.chrome.com/blog/enabling-shared-array-buffer) -- timeline and requirements for cross-origin isolation
- [RTL-SDR Blog: Ring Buffer Performance](https://www.rtl-sdr.com/significantly-improving-rtl_tcps-performance-with-ring-buffers/) -- sample drop prevention through ring buffers
- [GS1: EPC Gen2 Protocol Standard](https://www.gs1.org/sites/default/files/docs/epc/Gen2_Protocol_Standard.pdf) -- PIE timing, preamble structure, Tari specification
- [nkargas/Gen2-UHF-RFID-Reader](https://github.com/nkargas/Gen2-UHF-RFID-Reader) -- GNU Radio Gen2 implementation, practical decoding issues
- [Timingsense: UHF Gen2 RFID Channels](https://timingsense.com/en/blog/uhf-gen2-rfid-channels-europe-usa/) -- channel structure for EU/US regions
- [WICG/webusb Issue #184](https://github.com/WICG/webusb/issues/184) -- Access denied errors and driver conflicts
- [MDN: USBDevice.claimInterface()](https://developer.mozilla.org/en-US/docs/Web/API/USBDevice/claimInterface) -- WebUSB interface claim requirements
- [WebUSB Interface Claim Troubleshooting](https://copyprogramming.com/howto/tried-to-connect-a-device-to-web-via-webusb-but-failed-to-claim-interface-access-denied-insufficient-permissions) -- platform-specific driver conflict resolution

---
*Pitfalls research for: Browser-based UHF RFID protocol analyzer (RTL-SDR via WebUSB)*
*Researched: 2026-03-19*
