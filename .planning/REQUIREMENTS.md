# Requirements: UHF RFID Analyzer

**Defined:** 2026-03-19
**Core Value:** Engineers can see exactly what their UHF RFID reader is transmitting -- decoded EPC Gen2 commands with timing, raw bits, and RF visualization -- without expensive dedicated test equipment.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Hardware Connection

- [x] **HW-01**: User can discover and select an RTL-SDR V3/V4 dongle via WebUSB device picker
- [x] **HW-02**: User can connect to selected RTL-SDR and see connection status (connected/disconnected/error)
- [x] **HW-03**: User can set manual gain level for the RTL-SDR tuner
- [x] **HW-04**: User can set center frequency for the RTL-SDR
- [x] **HW-05**: User can select sample rate for the RTL-SDR

### UHF RFID Region & Tuning

- [x] **TUNE-01**: User can select a UHF RFID region preset (EU 865-868 MHz, US 902-928 MHz, China 920-925 MHz, Japan 916-921 MHz)
- [x] **TUNE-02**: Region selection auto-sets center frequency to the selected band
- [x] **TUNE-03**: User can manually override frequency within or outside region presets

### RF Visualization

- [x] **VIS-01**: User sees a live spectrum display (FFT) showing signal power across the tuned bandwidth
- [ ] **VIS-02**: User sees a live waterfall/spectrogram showing frequency activity over time
- [x] **VIS-03**: User can adjust FFT size (256, 512, 1024, 2048)
- [x] **VIS-04**: User can adjust spectrum averaging for noise reduction
- [x] **VIS-05**: Waterfall uses color mapping to indicate signal strength

### Protocol Decoding

- [ ] **DEC-01**: System demodulates EPC Gen2 PIE-encoded reader commands from raw IQ samples
- [ ] **DEC-02**: System decodes Query command with parameters (DR, M, TRext, Sel, Session, Target, Q)
- [ ] **DEC-03**: System decodes QueryRep command with session parameter
- [ ] **DEC-04**: System decodes QueryAdjust command with session and up/down parameters
- [ ] **DEC-05**: System decodes ACK command with RN16 parameter
- [ ] **DEC-06**: System decodes NAK command
- [ ] **DEC-07**: System decodes Select command with target, action, membank, pointer, length, mask, truncate parameters
- [ ] **DEC-08**: System decodes ReqRN command with RN16 and CRC parameters
- [ ] **DEC-09**: System validates CRC-16 on decoded frames and displays pass/fail
- [ ] **DEC-10**: System displays raw bits/symbols alongside each decoded command
- [ ] **DEC-11**: System adapts to varying Tari values (6.25-25us) by detecting preamble timing
- [ ] **DEC-12**: System groups decoded commands into inventory rounds (Query->ACK sequences)
- [ ] **DEC-13**: System attempts FM0/Miller backscatter decoding for tag responses (best-effort, clearly marked as experimental)

### Timeline / Message View

- [ ] **TL-01**: User sees a live scrolling list of decoded messages with millisecond timestamps
- [ ] **TL-02**: Each message is color-coded by command type (Query=blue, ACK=green, NAK=red, etc.)
- [ ] **TL-03**: Each message shows decoded command parameters in a readable format
- [ ] **TL-04**: User sees inter-command timing (time since previous command) on each message
- [ ] **TL-05**: User can filter the message list by command type
- [ ] **TL-06**: Message list auto-scrolls during live capture with pause-on-hover

### Infrastructure

- [x] **INFRA-01**: Application runs as a client-side SPA with no server dependency
- [x] **INFRA-02**: COOP/COEP headers configured for SharedArrayBuffer support
- [x] **INFRA-03**: DSP processing runs in Web Workers (not on main thread)
- [x] **INFRA-04**: Application displays clear error when browser does not support WebUSB

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Export & Capture

- **EXP-01**: User can export captured messages as JSON/CSV
- **EXP-02**: User can save and replay capture sessions
- **EXP-03**: User can share capture sessions with other users

### Advanced Hardware

- **ADV-01**: In-app driver troubleshooting guide for Windows/Linux
- **ADV-02**: Device info display (chipset, tuner, serial number)
- **ADV-03**: Auto-detect active channels by scanning region band

### Advanced Analysis

- **ANA-01**: Timing histogram of inter-command intervals
- **ANA-02**: Reader performance metrics (commands/sec, inventory rounds/sec)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Tag inventory/tracking | This is a protocol analyzer, not an RFID reader application |
| RFID tag emulation/transmission | RTL-SDR is receive-only hardware |
| Multi-SDR support | Adds complexity, single dongle sufficient for v1 |
| Mobile browser support | WebUSB not supported on mobile browsers |
| Non-RTL-SDR hardware | Scope limited to RTL-SDR V3/V4 for v1 |
| Server-side processing | Must run entirely in the browser |
| Real-time chat/collaboration | Not relevant to the use case |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HW-01 | Phase 1 | Complete |
| HW-02 | Phase 1 | Complete |
| HW-03 | Phase 1 | Complete |
| HW-04 | Phase 1 | Complete |
| HW-05 | Phase 1 | Complete |
| TUNE-01 | Phase 1 | Complete |
| TUNE-02 | Phase 1 | Complete |
| TUNE-03 | Phase 1 | Complete |
| VIS-01 | Phase 2 | Complete |
| VIS-02 | Phase 2 | Pending |
| VIS-03 | Phase 2 | Complete |
| VIS-04 | Phase 2 | Complete |
| VIS-05 | Phase 2 | Complete |
| DEC-01 | Phase 3 | Pending |
| DEC-02 | Phase 3 | Pending |
| DEC-03 | Phase 3 | Pending |
| DEC-04 | Phase 3 | Pending |
| DEC-05 | Phase 3 | Pending |
| DEC-06 | Phase 3 | Pending |
| DEC-07 | Phase 3 | Pending |
| DEC-08 | Phase 3 | Pending |
| DEC-09 | Phase 3 | Pending |
| DEC-10 | Phase 3 | Pending |
| DEC-11 | Phase 3 | Pending |
| DEC-12 | Phase 3 | Pending |
| DEC-13 | Phase 3 | Pending |
| TL-01 | Phase 4 | Pending |
| TL-02 | Phase 4 | Pending |
| TL-03 | Phase 4 | Pending |
| TL-04 | Phase 4 | Pending |
| TL-05 | Phase 4 | Pending |
| TL-06 | Phase 4 | Pending |
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 after roadmap creation*
