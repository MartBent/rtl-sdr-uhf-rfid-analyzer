# Phase 3: Protocol Decoding Engine - Research

**Researched:** 2026-03-20
**Domain:** EPC Gen2 UHF RFID protocol decoding -- PIE demodulation, command parsing, CRC validation, FM0/Miller backscatter, WASM DSP
**Confidence:** MEDIUM-HIGH

## Summary

Phase 3 transforms raw IQ samples from the existing DSP Worker into decoded EPC Gen2 reader commands. This is the highest technical risk phase in the project: there is zero prior art for browser-based EPC Gen2 PIE demodulation in WASM. The core challenge is building a real-time demodulation pipeline in C/Emscripten that runs inside the existing DSP Worker alongside FFT processing, producing a bit stream that TypeScript code then parses into structured Gen2 commands.

The phase divides cleanly into two technical domains: (1) the WASM hot path handling envelope detection, pulse measurement, and adaptive Tari/PIE symbol extraction, and (2) the TypeScript cold path handling preamble/frame-sync detection, Gen2 command parsing, CRC-5/CRC-16 validation, parameter extraction, inventory round grouping, and FM0/Miller backscatter decoding. The WASM boundary is driven by performance -- at 2.4 MSPS, envelope detection on every sample cannot run in JS without frame drops.

**Primary recommendation:** Build the C/Emscripten demodulator first with synthetic test data, validate the JS command parser with known bit patterns, then integrate into the DSP Worker. The demodulator outputs a timestamped bit stream with Tari measurements; all protocol intelligence lives in TypeScript where it is easier to test and iterate.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- WASM (C/Emscripten) handles the hot path: envelope detection, PIE symbol extraction, adaptive Tari detection -- outputs a bit stream with timing
- TypeScript handles: frame sync (preamble detection), Gen2 command parsing, CRC-16 validation, command parameter extraction, inventory round grouping
- WASM demod runs inside the existing DSP Worker alongside FFT processing -- no additional worker
- IQ data flows through both FFT and demod paths from the same polling loop
- Live hardware only -- no file replay or recorded IQ input for Phase 3
- New DspToMainMessage types carry decoded bit stream / commands from DSP Worker to main thread
- Decoded output replaces the "Timeline (Phase 4)" placeholder panel
- Decode stats (total commands, CRC pass rate, commands/sec) shown in the panel header, not the global status bar
- Raw bits available via click/expand, not shown by default
- FM0/Miller backscatter decoding implemented in Phase 3 (best-effort, not deferred)
- Backscatter results hidden behind "Experimental: Show tag responses" toggle, off by default
- When backscatter enabled, tag responses shown inline with reader commands, visually distinct (warning icon + confidence %)
- Inventory round grouping delivered in Phase 3
- Round numbering displayed; incomplete rounds flagged
- Incomplete round flag only shown when backscatter display is toggled ON

### Claude's Discretion
- WASM build toolchain (Emscripten vs bare clang wasm32) -- pick based on demodulator's actual needs
- Decoded output format (console log vs table vs hybrid)
- Visual separator style for inventory rounds
- Confidence threshold for backscatter discard
- WASM memory management and JS bridge design
- Exact typing of new worker messages for decoded data
- How DSP Worker splits IQ data between FFT and demod paths
- FM0 vs Miller detection heuristics

### Deferred Ideas (OUT OF SCOPE)
- File replay / recorded IQ input for testing without hardware -- future phase or v2
- Color coding per command type -- Phase 4 timeline UI
- Command type filtering -- Phase 4 timeline UI
- Auto-scroll with pause-on-hover -- Phase 4 timeline UI
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEC-01 | System demodulates EPC Gen2 PIE-encoded reader commands from raw IQ samples | WASM envelope detector + PIE symbol extractor; Architecture Pattern 1 (demod pipeline) |
| DEC-02 | System decodes Query command with parameters (DR, M, TRext, Sel, Session, Target, Q) | Gen2 command parser in TypeScript; Command Format Reference table below |
| DEC-03 | System decodes QueryRep command with session parameter | Gen2 command parser; 2-bit command code "00" + 2-bit session |
| DEC-04 | System decodes QueryAdjust command with session and up/down parameters | Gen2 command parser; 4-bit command "1001" + session + updn |
| DEC-05 | System decodes ACK command with RN16 parameter | Gen2 command parser; 2-bit command "01" + 16-bit RN16 |
| DEC-06 | System decodes NAK command | Gen2 command parser; 8-bit fixed pattern "11000000" |
| DEC-07 | System decodes Select command with full parameters | Gen2 command parser; variable-length command with mask field |
| DEC-08 | System decodes ReqRN command with RN16 and CRC | Gen2 command parser; 8-bit command "11000001" + RN16 + CRC-16 |
| DEC-09 | System validates CRC-16 on decoded frames and displays pass/fail | CRC-16 implementation (polynomial 0x1021, preset 0xFFFF); CRC-5 for Query |
| DEC-10 | System displays raw bits/symbols alongside each decoded command | Expandable row pattern in decoded output panel; bits stored per command |
| DEC-11 | System adapts to varying Tari values (6.25-25us) by detecting preamble timing | Adaptive Tari detection in WASM via preamble RTcal measurement |
| DEC-12 | System groups decoded commands into inventory rounds | Round state machine in TypeScript tracking Query->ACK sequences |
| DEC-13 | System attempts FM0/Miller backscatter decoding (experimental) | FM0 correlation decoder in TypeScript; confidence scoring; toggle UI |
</phase_requirements>

## Standard Stack

### Core (New for Phase 3)

| Library/Tool | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| Emscripten (emsdk) | 3.1.x (latest) | C to WASM compilation for demodulator | Most mature C-to-WASM toolchain; supports SIMD, ES6 module output, memory growth; project already has vite-plugin-wasm configured |
| vite-plugin-wasm | 3.6.0 (installed) | WASM ES module integration in Vite | Already in project; handles .wasm imports in both main bundle and workers |

### Existing (Already Installed)

| Library | Version | Role in Phase 3 |
|---------|---------|-----------------|
| Svelte 5 | ^5.54.0 | Decoded output panel UI with $state/$props runes |
| Vite 8 | ^8.0.1 | Build toolchain; WASM plugin already configured |
| TypeScript 5 | ^5.9.3 | Gen2 command parser, CRC validation, type definitions |
| Tailwind CSS 4 | ^4.2.2 | Styling for decoded output panel |
| ringbuf.js | ^0.4.0 | Existing IQ ring buffer (unchanged) |
| vitest | ^4.1.0 | Unit testing for parser, CRC, demod logic |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Emscripten | bare clang --target=wasm32 | Smaller output, no runtime overhead, but no malloc/free, no SIMD intrinsics convenience, no printf debugging. Emscripten is better because the demodulator needs dynamic memory (staging buffers) and SIMD. |
| Emscripten | AssemblyScript | TypeScript-like syntax but weaker SIMD support and less mature tooling for DSP work. C is the natural language for signal processing algorithms. |
| Custom WASM demod | Pure TypeScript demod | Fine for prototyping but cannot sustain 2.4 MSPS real-time envelope detection. At 2.4M samples/sec with sqrt(I^2+Q^2) per sample, JS is ~3-5x too slow. |

### No New NPM Dependencies Required

The WASM module is compiled separately via Emscripten and loaded as a static asset. No additional npm packages are needed beyond what is already installed.

**Emscripten Installation (build-time only):**
```bash
# One-time system setup (not an npm dependency)
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh
```

## Architecture Patterns

### Recommended Project Structure (New files for Phase 3)

```
src/
  lib/
    dsp/
      dsp-worker.ts          # MODIFIED: add demod path alongside FFT in pollRingBuffer()
      demod-processor.ts      # NEW: TypeScript wrapper for WASM demodulator (init/process/dispose)
      fft-processor.ts        # EXISTING (unchanged)
    protocol/                 # NEW: all EPC Gen2 protocol logic
      gen2-types.ts           # NEW: TypeScript types for Gen2 commands, parameters, enums
      gen2-decoder.ts         # NEW: bit stream -> Gen2 command parser
      gen2-crc.ts             # NEW: CRC-5 and CRC-16 validation
      frame-sync.ts           # NEW: preamble/frame-sync detection from bit stream
      inventory-tracker.ts    # NEW: round grouping state machine
      fm0-decoder.ts          # NEW: FM0 backscatter decoder (experimental)
      miller-decoder.ts       # NEW: Miller subcarrier decoder (experimental)
    wasm/                     # NEW: WASM build artifacts and C source
      demod.c                 # NEW: C source for envelope detector + PIE extractor
      Makefile                # NEW: Emscripten build script
      demod.mjs               # BUILD OUTPUT: ES6 module factory
      demod.wasm              # BUILD OUTPUT: compiled WASM binary
    workers/
      worker-messages.ts      # MODIFIED: add decoded command message types
      worker-bridge.ts        # MODIFIED: add onDecodedData callback
    state/
      decode-state.svelte.ts  # NEW: decoded command ring buffer, stats, round tracking
    components/
      DecodedOutputPanel.svelte   # NEW: replaces PlaceholderPanel, shows decoded commands
      DecodedCommandRow.svelte    # NEW: single command row with expandable raw bits
      DecodeControlsPanel.svelte  # NEW: sidebar panel for decode settings + backscatter toggle
  routes/
    +page.svelte              # MODIFIED: replace PlaceholderPanel with DecodedOutputPanel
```

### Pattern 1: WASM Demodulator as Processor Class

**What:** Follow the existing FftProcessor pattern (init/process/dispose) for the WASM demodulator. The DemodProcessor class loads the WASM module, allocates input/output buffers in WASM memory, and exposes a `process(iqData, length)` method that returns extracted symbols with timing.

**When to use:** Always for WASM integration in this project -- matches the established pattern.

**Example:**
```typescript
// src/lib/dsp/demod-processor.ts
import createDemodModule from '../wasm/demod.mjs';

interface DemodSymbol {
  type: 'data-0' | 'data-1' | 'delimiter' | 'rtcal' | 'trcal';
  sampleOffset: number;     // position in IQ stream
  durationSamples: number;  // pulse width in samples
}

interface DemodResult {
  symbols: DemodSymbol[];
  detectedTari: number;     // Tari in samples (0 if no preamble detected)
  envelopeLevel: number;    // average signal level for this block
}

export class DemodProcessor {
  private module: any;
  private inputPtr: number = 0;
  private outputPtr: number = 0;
  private bufferSize: number;

  async init(maxSamples: number): Promise<void> {
    this.module = await createDemodModule();
    this.bufferSize = maxSamples;
    // Allocate WASM-side buffers
    this.inputPtr = this.module._malloc(maxSamples * 2); // uint8 I/Q pairs
    this.outputPtr = this.module._malloc(maxSamples * 12); // output struct array
  }

  process(iqData: Uint8Array, length: number, sampleRate: number): DemodResult {
    // Copy IQ data into WASM heap
    this.module.HEAPU8.set(iqData.subarray(0, length), this.inputPtr);
    // Call C function
    const symbolCount = this.module._demod_process(
      this.inputPtr, length, sampleRate, this.outputPtr
    );
    // Read results from WASM heap
    return this.readResults(symbolCount);
  }

  dispose(): void {
    if (this.module) {
      this.module._free(this.inputPtr);
      this.module._free(this.outputPtr);
    }
  }
}
```

### Pattern 2: Dual-Path Processing in DSP Worker

**What:** The existing `pollRingBuffer()` loop reads IQ data from the ring buffer. Each chunk is sent to both the FFT path (existing) AND the demod path (new). The demod path runs the WASM envelope detector, then passes extracted symbols to TypeScript for frame sync and command parsing.

**When to use:** This is the locked architecture from CONTEXT.md.

**Example:**
```typescript
// In dsp-worker.ts pollRingBuffer(), after the existing read loop:
do {
  read = ringReader.pop(READ_BUFFER);
  if (read > 0) {
    totalRead += read;
    if (fftProcessor) {
      processFftData(READ_BUFFER, read);
    }
    if (demodProcessor) {
      processDemodData(READ_BUFFER, read);  // NEW: parallel demod path
    }
  }
} while (read === READ_BUFFER.length);
```

### Pattern 3: Layered Protocol Decoding Pipeline

**What:** The decode pipeline is a chain of stages with clear input/output contracts:
1. **WASM Demod** (C): Raw IQ -> envelope -> edge detection -> pulse measurement -> symbol stream
2. **Frame Sync** (TS): Symbol stream -> preamble detection -> Tari calibration -> bit stream
3. **Command Parser** (TS): Bit stream -> Gen2 command identification -> parameter extraction
4. **CRC Validator** (TS): Command bits -> CRC-5/CRC-16 check -> pass/fail
5. **Inventory Tracker** (TS): Command sequence -> round grouping -> round state

**When to use:** Always. Each stage is independently testable.

### Pattern 4: Decoded Message Ring Buffer

**What:** Decoded commands are stored in a fixed-size ring buffer (e.g., 5000 entries) in state, not an ever-growing array. Older messages are overwritten. This prevents memory growth during long capture sessions.

**When to use:** Always for streaming decoded data.

### Anti-Patterns to Avoid

- **Decoding in WASM:** Do NOT put Gen2 command parsing, CRC validation, or inventory tracking in C/WASM. These are complex branching logic that changes frequently during development. Keep protocol intelligence in TypeScript where it is easy to debug and test.
- **Blocking WASM init:** Do NOT use synchronous WASM instantiation. The Emscripten factory function is async; call it during capture-started and cache the module.
- **Allocating per-frame:** Do NOT allocate new TypedArrays or WASM buffers per processing cycle. Pre-allocate buffers at init and reuse them. The existing FftProcessor already demonstrates this pattern.
- **Over-buffering decoded commands:** Do NOT accumulate more than a few thousand decoded commands in state. UHF readers send hundreds of commands per second.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CRC-16 calculation | Custom bit-banging CRC | Lookup-table-based CRC-16/GENIBUS implementation | CRC lookup tables are 10-50x faster than bit-by-bit; the polynomial (0x1021, preset 0xFFFF, XOR 0xFFFF) is well-defined by EPC Gen2 spec |
| CRC-5 calculation | Custom implementation | Lookup-table-based CRC-5 (polynomial 0x09, preset 0x09) | Same reason; used for Query command validation |
| WASM memory management | Manual pointer tracking | Emscripten's _malloc/_free with pre-allocated buffers | Emscripten handles memory growth and provides HEAPU8/HEAPF32 views |
| Ring buffer for decoded messages | Array.push + Array.shift | Fixed-size typed ring buffer with head/tail indices | Array.shift is O(n); ring buffer is O(1) for both push and dequeue |
| Envelope detection SIMD | Scalar sqrt(I^2+Q^2) in JS | WASM SIMD via Emscripten -msimd128 | 4x throughput via v128 operations on packed float32 |

**Key insight:** The protocol parsing (TypeScript) is inherently branchy and string-heavy -- not a good WASM candidate. The envelope detection (C/WASM) is inherently numerical and vectorizable -- not a good JS candidate. Respect this boundary.

## EPC Gen2 Protocol Reference

### PIE Encoding (Reader-to-Tag)

The reader transmits using Pulse Interval Encoding (PIE). Signal levels:
- **High:** CW (continuous wave) carrier present
- **Low:** Carrier suppressed (amplitude modulation)

Timing parameters (all derived from Tari):
| Symbol | Duration | Description |
|--------|----------|-------------|
| Tari | 6.25-25 us | Reference time interval; duration of data-0 |
| data-0 | 1.0 x Tari | Short pulse interval = logic 0 |
| data-1 | 1.5-2.0 x Tari | Long pulse interval = logic 1 |
| Delimiter | 12.5 us (fixed) | Fixed-duration pulse preceding preamble |
| PW (pulse width) | 0.265-0.525 x Tari | Low-state duration within each symbol |

### Preamble and Frame-Sync

**Preamble** (precedes Query command only):
```
[Delimiter] [data-0] [RTcal] [TRcal]
```
- RTcal = data-0 + data-1 (Reader-to-Tag calibration symbol)
- TRcal encodes the tag Backscatter Link Frequency: BLF = DR / TRcal
- Tari is extracted from data-0 duration in preamble
- Threshold for 0 vs 1: RTcal / 2 (midpoint between data-0 and data-1)

**Frame-Sync** (precedes all other reader commands):
```
[Delimiter] [data-0] [RTcal]
```
- Same as preamble minus TRcal
- Uses same Tari/RTcal timing as the most recent preamble

### Adaptive Tari Detection Algorithm

```
1. Detect delimiter (12.5us fixed pulse)
2. Measure next symbol duration -> this is data-0 -> Tari = duration
3. Measure next symbol duration -> this is RTcal = data-0 + data-1
4. Derive pivot = RTcal / 2 (threshold for classifying subsequent symbols)
5. If preamble (not frame-sync): measure TRcal for BLF calculation
6. For subsequent symbols: duration < pivot -> data-0; duration >= pivot -> data-1
```

### Reader Command Formats

| Command | Code | Fields (after code) | Total Bits | CRC |
|---------|------|---------------------|-----------|-----|
| Query | 1000 | DR(1) M(2) TRext(1) Sel(2) Session(2) Target(1) Q(4) CRC-5(5) | 22 | CRC-5 |
| QueryRep | 00 | Session(2) | 4 | None |
| QueryAdjust | 1001 | Session(2) UpDn(3) | 9 | None |
| ACK | 01 | RN16(16) | 18 | None |
| NAK | 11000000 | (none) | 8 | None |
| Select | 1011 | Target(3) Action(3) MemBank(2) Pointer(EBV) Length(8) Mask(variable) Truncate(1) CRC-16(16) | Variable | CRC-16 |
| ReqRN | 11000001 | RN16(16) CRC-16(16) | 40 | CRC-16 |

### Query Parameter Decoding

| Field | Bits | Values |
|-------|------|--------|
| DR | 1 | 0=DR=8, 1=DR=64/3 |
| M | 2 | 00=FM0, 01=Miller2, 10=Miller4, 11=Miller8 |
| TRext | 1 | 0=no pilot tone, 1=pilot tone |
| Sel | 2 | 00=All, 01=All, 10=~SL, 11=SL |
| Session | 2 | 00=S0, 01=S1, 10=S2, 11=S3 |
| Target | 1 | 0=A, 1=B |
| Q | 4 | 0-15 (expected slot count = 2^Q) |

### CRC Specifications

**CRC-5 (Query command only):**
- Polynomial: x^5 + x^3 + 1 (0x09)
- Preset: 0x09
- Residue: 0x00 when CRC is appended
- Computed over command bits excluding CRC-5 field

**CRC-16 (Select, ReqRN, and tag responses):**
- Polynomial: x^16 + x^12 + x^5 + 1 (0x1021)
- Preset: 0xFFFF
- XOR-out: 0xFFFF
- This is CRC-16/GENIBUS (NOT standard CCITT)
- Residue: 0x1D0F when CRC is appended and correct

### FM0 Encoding (Tag Backscatter)

FM0 uses phase inversions to encode data:
- **Every symbol boundary:** mandatory phase inversion
- **data-0:** additional phase inversion at mid-symbol
- **data-1:** no mid-symbol inversion

FM0 Preamble: `1010v1` (6 symbols, v = violation = no transition at boundary)

Detection algorithm (from nkargas/Gen2-UHF-RFID-Reader):
1. Correlate against known preamble pattern {1,1,-1,1,-1,-1,1,-1,-1,-1,1,1}
2. Find maximum correlation peak for frame alignment
3. Estimate channel from preamble samples (average 6 positive-bit positions)
4. Decode via differential detection: subtract consecutive half-bit samples, multiply by conjugate of channel estimate
5. Classify based on sign relative to previous state

### Miller Encoding (Tag Backscatter)

Miller-M (M=2,4,8) uses a subcarrier at M cycles per symbol:
- **data-0:** no phase change at symbol boundary
- **data-1:** phase change at symbol boundary

Miller is more noise-resistant than FM0 due to spectral concentration at subcarrier frequency. Detection is harder but more reliable in noisy environments.

### Inventory Round Structure

A complete inventory round:
```
Query -> [tag RN16] -> ACK(RN16) -> [tag EPC+PC+CRC] -> QueryRep/QueryAdjust -> ...
```

Round boundaries:
- **Start:** Query command (always starts a new round)
- **End:** Next Query command, or timeout
- **Incomplete:** Round with Query but no ACK (or ACK with CRC failure on tag response)

## Common Pitfalls

### Pitfall 1: Hardcoded Tari Thresholds
**What goes wrong:** Decoder works with one reader (e.g., Tari=12.5us) but fails with others.
**Why it happens:** Developer tests with one reader and hardcodes timing values.
**How to avoid:** Implement adaptive Tari detection from the preamble RTcal measurement on every transmission. Use ratio-based classification (symbol_duration vs RTcal/2) not absolute microsecond thresholds.
**Warning signs:** CRC failures when switching readers; decode rate drops to near-zero with different hardware.

### Pitfall 2: WASM Module Not Ready When Data Arrives
**What goes wrong:** First IQ data arrives before WASM module finishes async initialization.
**Why it happens:** Emscripten module loading is async; capture can start before WASM init completes.
**How to avoid:** Initialize WASM module during `capture-started` handler, before starting the poll loop. Or pre-initialize during DSP Worker startup and cache the module. Gate the demod path on module readiness.
**Warning signs:** Undefined errors on first capture start; works on second start.

### Pitfall 3: WASM Heap View Invalidation
**What goes wrong:** HEAPU8/HEAPF32 views become invalid after memory growth, causing silent data corruption.
**Why it happens:** When Emscripten grows WASM linear memory, all existing ArrayBuffer views are detached.
**How to avoid:** Re-acquire HEAPU8/HEAPF32 references after any call that might trigger memory growth. Or use `-sALLOW_MEMORY_GROWTH=0` with a fixed, pre-allocated memory size (recommended for predictable DSP workloads).
**Warning signs:** Random garbage data in demod output; works initially but corrupts after minutes of capture.

### Pitfall 4: Frame Sync State Leaking Across Data Chunks
**What goes wrong:** Preamble straddles two consecutive ring buffer reads; decoder loses sync.
**Why it happens:** The ring buffer read loop returns arbitrary-sized chunks. A preamble or command might span two reads.
**How to avoid:** The WASM demodulator must maintain state across calls. Use a state machine that persists edge detection state, partial pulse measurements, and accumulated symbols between process() calls. The C code must have static/persistent state, not reset each call.
**Warning signs:** Decoder works with large buffer reads but misses commands with smaller reads.

### Pitfall 5: Signal Level Misclassification
**What goes wrong:** Envelope detector triggers on noise, producing false symbols that flood the parser.
**Why it happens:** No signal gating; the decoder tries to decode even when no RFID reader is transmitting.
**How to avoid:** Implement a signal gate in the WASM demodulator: only start edge detection when envelope level exceeds a noise threshold. Use a moving average of the envelope to estimate noise floor. Only trigger on transitions that cross the threshold with hysteresis.
**Warning signs:** Hundreds of garbage "commands" per second when no reader is present; high CRC failure rate.

### Pitfall 6: Select Command Variable-Length Parsing
**What goes wrong:** Select command mask field has variable length (determined by Length field); parser reads past end of command or too few bits.
**Why it happens:** Unlike fixed-length commands (Query=22 bits, ACK=18 bits), Select length depends on its own Length parameter. Parser must read the Length field first, then consume that many mask bits.
**How to avoid:** Parse Select command in two passes: first parse fixed fields up to Length, then use Length value to determine mask size, then parse remaining bits. Total: 4+3+3+2+EBV+8+mask+1+16 bits.
**Warning signs:** CRC-16 always fails on Select commands; mask data is garbage.

## Code Examples

### CRC-16/GENIBUS Implementation

```typescript
// src/lib/protocol/gen2-crc.ts
// EPC Gen2 CRC-16: polynomial 0x1021, preset 0xFFFF, XOR-out 0xFFFF

const CRC16_TABLE = new Uint16Array(256);
// Pre-compute lookup table
for (let i = 0; i < 256; i++) {
  let crc = i << 8;
  for (let j = 0; j < 8; j++) {
    crc = (crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0);
  }
  CRC16_TABLE[i] = crc & 0xFFFF;
}

/**
 * Compute CRC-16 over a bit array.
 * @param bits - Array of 0/1 values
 * @returns 16-bit CRC value
 */
export function crc16(bits: number[]): number {
  let crc = 0xFFFF; // preset
  // Process bit-by-bit (commands are not byte-aligned)
  for (const bit of bits) {
    const msb = (crc >> 15) & 1;
    crc = ((crc << 1) | bit) & 0xFFFF;
    if (msb) crc ^= 0x1021;
  }
  return crc ^ 0xFFFF; // XOR-out
}

/**
 * Validate CRC-16 by computing over data+crc; residue should be 0x1D0F.
 */
export function validateCrc16(bitsWithCrc: number[]): boolean {
  return crc16(bitsWithCrc) === 0x1D0F;
}

/**
 * CRC-5 for Query command.
 * Polynomial: x^5 + x^3 + 1 (0x09), preset: 0x09
 */
export function crc5(bits: number[]): number {
  let crc = 0x09; // preset
  for (const bit of bits) {
    const msb = (crc >> 4) & 1;
    crc = ((crc << 1) | bit) & 0x1F;
    if (msb) crc ^= 0x09;
  }
  return crc;
}

export function validateCrc5(bitsWithCrc: number[]): boolean {
  return crc5(bitsWithCrc) === 0x00;
}
```

### Gen2 Command Parser Structure

```typescript
// src/lib/protocol/gen2-types.ts
export type Gen2CommandType =
  | 'Query' | 'QueryRep' | 'QueryAdjust'
  | 'ACK' | 'NAK' | 'Select' | 'ReqRN' | 'Unknown';

export interface Gen2Command {
  type: Gen2CommandType;
  rawBits: number[];           // original bits for display
  sampleOffset: number;        // position in IQ stream for timing
  timestamp: number;           // derived from sample offset + sample rate
  crcValid: boolean | null;    // null for commands without CRC
  params: Record<string, unknown>;
  roundId: number;             // inventory round number
}

// Example: Query-specific parameters
export interface QueryParams {
  dr: 8 | 64/3;
  m: 'FM0' | 'Miller2' | 'Miller4' | 'Miller8';
  trext: boolean;
  sel: 'All' | '~SL' | 'SL';
  session: 'S0' | 'S1' | 'S2' | 'S3';
  target: 'A' | 'B';
  q: number;
}
```

### C Demodulator Core (Envelope + Edge Detection)

```c
// src/lib/wasm/demod.c
#include <emscripten.h>
#include <math.h>
#include <stdint.h>

// Persistent state across process() calls
static float envelope_avg = 0.0f;
static float noise_floor = 0.01f;
static int last_edge_sample = 0;
static int edge_state = 0; // 0 = below threshold, 1 = above
static float threshold_high = 0.0f;
static float threshold_low = 0.0f;

// Output symbol buffer
typedef struct {
    int32_t sample_offset;    // sample index where symbol starts
    int32_t duration_samples; // pulse width in samples
    int32_t symbol_type;      // 0=pulse-low, 1=pulse-high
    float amplitude;          // envelope amplitude at this point
} DemodSymbol;

EMSCRIPTEN_KEEPALIVE
int demod_process(
    const uint8_t* iq_data,
    int byte_count,
    int sample_rate,
    DemodSymbol* output
) {
    int sample_count = byte_count / 2;
    int symbol_count = 0;
    const float alpha = 0.001f; // noise floor tracking

    for (int i = 0; i < sample_count; i++) {
        // Convert uint8 IQ to float and compute envelope (magnitude)
        float iVal = (iq_data[i * 2] - 127.5f) / 127.5f;
        float qVal = (iq_data[i * 2 + 1] - 127.5f) / 127.5f;
        float env = sqrtf(iVal * iVal + qVal * qVal);

        // Track noise floor with slow IIR
        noise_floor = noise_floor * (1.0f - alpha) + env * alpha;

        // Hysteresis thresholds
        threshold_high = noise_floor * 3.0f;
        threshold_low = noise_floor * 2.0f;

        // Edge detection with hysteresis
        int new_state = edge_state;
        if (edge_state == 0 && env > threshold_high) {
            new_state = 1; // rising edge
        } else if (edge_state == 1 && env < threshold_low) {
            new_state = 0; // falling edge
        }

        if (new_state != edge_state) {
            // Record pulse duration
            int duration = i - last_edge_sample;
            if (duration > 0) {
                output[symbol_count].sample_offset = last_edge_sample;
                output[symbol_count].duration_samples = duration;
                output[symbol_count].symbol_type = edge_state; // state we're leaving
                output[symbol_count].amplitude = env;
                symbol_count++;
            }
            last_edge_sample = i;
            edge_state = new_state;
        }
    }

    return symbol_count;
}

EMSCRIPTEN_KEEPALIVE
void demod_reset(void) {
    envelope_avg = 0.0f;
    noise_floor = 0.01f;
    last_edge_sample = 0;
    edge_state = 0;
}
```

### Emscripten Build Command

```makefile
# src/lib/wasm/Makefile
CC = emcc
CFLAGS = -O3 -msimd128 -sEXPORT_ES6=1 -sMODULARIZE=1 \
         -sEXPORTED_FUNCTIONS=_demod_process,_demod_reset,_malloc,_free \
         -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF32 \
         -sALLOW_MEMORY_GROWTH=0 \
         -sINITIAL_MEMORY=4194304 \
         -sENVIRONMENT=worker \
         -sNO_FILESYSTEM=1 \
         --no-entry

demod.mjs: demod.c
	$(CC) $(CFLAGS) -o $@ $<

clean:
	rm -f demod.mjs demod.wasm

.PHONY: clean
```

Key flags explained:
- `-O3 -msimd128`: Maximum optimization with SIMD
- `-sEXPORT_ES6=1 -sMODULARIZE=1`: ES6 module output for Vite import
- `-sALLOW_MEMORY_GROWTH=0`: Fixed memory prevents heap view invalidation
- `-sINITIAL_MEMORY=4194304`: 4MB fixed heap (sufficient for demod buffers)
- `-sENVIRONMENT=worker`: Strip browser-specific code, optimize for worker
- `-sNO_FILESYSTEM=1`: No virtual filesystem needed, reduces output size
- `--no-entry`: No main() function

### Worker Message Types Extension

```typescript
// Additions to src/lib/workers/worker-messages.ts

export interface DecodedCommandMessage {
  type: Gen2CommandType;
  rawBits: number[];
  sampleOffset: number;
  timestamp: number;        // ms since capture start
  crcValid: boolean | null;
  params: Record<string, unknown>;
}

export type DspToMainMessage =
  | { type: 'dsp-ready' }
  | { type: 'dsp-stats'; samplesProcessed: number }
  | { type: 'fft-data'; bins: Float32Array; binCount: number; centerFrequency: number; sampleRate: number }
  // NEW:
  | { type: 'decoded-commands'; commands: DecodedCommandMessage[]; roundUpdates: RoundUpdate[] }
  | { type: 'decode-stats'; totalCommands: number; crcPassRate: number; commandsPerSec: number; detectedTari: number };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Emscripten -s flags | Emscripten -s flags still standard but .mjs auto-enables ES6 | Emscripten 3.x | Use .mjs output filename for cleaner config |
| WASM SIMD experimental | WASM SIMD stable in Chrome 91+ | 2021 | Safe to use -msimd128 for all target browsers |
| vite-plugin-top-level-await required for WASM | Vite 8 native top-level await support | 2026 | May not need the plugin; test without it first |
| Manual CRC bit-by-bit | Still bit-by-bit for non-byte-aligned data | -- | Gen2 commands are not byte-aligned, so standard byte-oriented CRC libs do not work. Must implement bit-level CRC. |

**Deprecated/outdated:**
- `vite-plugin-top-level-await` may be unnecessary with Vite 8's native support (previously needed for Vite 5-7). The project has it installed; test removing it.

## Open Questions

1. **WASM SIMD for envelope detection**
   - What we know: -msimd128 enables WASM SIMD; sqrt(I^2+Q^2) vectorizes well with v128.f32x4 operations
   - What's unclear: Whether Emscripten auto-vectorizes the envelope loop or if intrinsics are needed
   - Recommendation: Start with scalar C code and -O3 -msimd128; profile first. Add explicit SIMD intrinsics only if auto-vectorization is insufficient.

2. **Exact noise gate threshold**
   - What we know: The envelope detector needs a noise gate to avoid false triggers on noise-only signals
   - What's unclear: Optimal threshold multiplier (2x, 3x, 5x noise floor?)
   - Recommendation: Start with 3x noise floor with hysteresis (3x rise, 2x fall). Make it configurable in the DSP settings. Tune with real hardware.

3. **FM0 backscatter feasibility with RTL-SDR**
   - What we know: Tag backscatter is 60-80 dB below reader signal. RTL-SDR has ~48 dB dynamic range.
   - What's unclear: Whether any real-world backscatter is detectable given RTL-SDR limitations
   - Recommendation: Implement FM0 correlation decoder but expect it to work only in ideal conditions (close proximity, strong tag, low noise). The confidence scoring and experimental toggle address this uncertainty. Set initial discard threshold at 50% confidence.

4. **vite-plugin-wasm in worker context**
   - What we know: vite-plugin-wasm supports worker.plugins configuration. The project already has it installed.
   - What's unclear: Whether the WASM module loads correctly when imported inside the DSP Worker with Vite 8's Rolldown bundler
   - Recommendation: Test early. Fallback: place .wasm in static/ and use fetch() + WebAssembly.instantiate() directly in the worker.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEC-01 | PIE demodulation from IQ samples | unit | `npx vitest run src/lib/dsp/demod-processor.test.ts -x` | Wave 0 |
| DEC-02 | Query command decode with all params | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | Wave 0 |
| DEC-03 | QueryRep command decode | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | Wave 0 |
| DEC-04 | QueryAdjust command decode | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | Wave 0 |
| DEC-05 | ACK command decode with RN16 | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | Wave 0 |
| DEC-06 | NAK command decode | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | Wave 0 |
| DEC-07 | Select command decode with variable fields | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | Wave 0 |
| DEC-08 | ReqRN command decode with CRC | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | Wave 0 |
| DEC-09 | CRC-16 validation pass/fail | unit | `npx vitest run src/lib/protocol/gen2-crc.test.ts -x` | Wave 0 |
| DEC-10 | Raw bits displayed per command | unit | `npx vitest run src/lib/protocol/gen2-decoder.test.ts -x` | Wave 0 |
| DEC-11 | Adaptive Tari detection (6.25-25us) | unit | `npx vitest run src/lib/protocol/frame-sync.test.ts -x` | Wave 0 |
| DEC-12 | Inventory round grouping | unit | `npx vitest run src/lib/protocol/inventory-tracker.test.ts -x` | Wave 0 |
| DEC-13 | FM0/Miller backscatter decode | unit | `npx vitest run src/lib/protocol/fm0-decoder.test.ts -x` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/protocol/gen2-crc.test.ts` -- covers DEC-09 (CRC-5 and CRC-16 validation)
- [ ] `src/lib/protocol/gen2-decoder.test.ts` -- covers DEC-02 through DEC-08, DEC-10 (command parsing)
- [ ] `src/lib/protocol/frame-sync.test.ts` -- covers DEC-11 (adaptive Tari, preamble detection)
- [ ] `src/lib/protocol/inventory-tracker.test.ts` -- covers DEC-12 (round grouping)
- [ ] `src/lib/protocol/fm0-decoder.test.ts` -- covers DEC-13 (FM0 backscatter)
- [ ] `src/lib/dsp/demod-processor.test.ts` -- covers DEC-01 (WASM demod integration)
- [ ] Emscripten toolchain must be installed for WASM compilation

## Sources

### Primary (HIGH confidence)
- [GS1 EPC Gen2 Standard v2.1](https://www.gs1.org/sites/default/files/docs/epc/Gen2_Protocol_Standard.pdf) -- PIE encoding, command formats, CRC polynomials, FM0/Miller specs (authoritative standard)
- [GS1 EPC Gen2 Standard v2.0.0](https://www.gs1.org/sites/default/files/docs/epc/uhfc1g2_2_0_0_standard_20131101.pdf) -- Older version with same core PIE/command definitions
- [Emscripten Modularized Output docs](https://emscripten.org/docs/compiling/Modularized-Output.html) -- MODULARIZE + EXPORT_ES6 flags for ES module output
- [Emscripten Interacting with Code](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/Interacting-with-code.html) -- EXPORTED_FUNCTIONS, ccall/cwrap, HEAP views, malloc/free
- [Emscripten Building to WebAssembly](https://emscripten.org/docs/compiling/WebAssembly.html) -- WASM compilation reference
- [vite-plugin-wasm](https://github.com/Menci/vite-plugin-wasm) -- WASM ESM integration in Vite; worker.plugins config
- Project source: `src/lib/dsp/dsp-worker.ts` -- existing DSP Worker with pollRingBuffer() integration point
- Project source: `src/lib/dsp/fft-processor.ts` -- FftProcessor class pattern to follow for DemodProcessor
- Project source: `src/lib/workers/worker-messages.ts` -- typed message protocol to extend
- Project source: `src/lib/workers/worker-bridge.ts` -- WorkerBridge interface to extend with onDecodedData

### Secondary (MEDIUM confidence)
- [nkargas/Gen2-UHF-RFID-Reader](https://github.com/nkargas/Gen2-UHF-RFID-Reader) -- GNU Radio Gen2 reader; gate detector and FM0 decoder algorithms used as reference for our C/TS implementations
- [TI UHF Gen2 Protocol Reference Guide](https://www.ti.com/lit/ug/scbu001/scbu001.pdf) -- Command format tables, timing diagrams
- [atlasRFIDstore CRC-16 explanation](https://www.atlasrfidstore.com/rfid-insider/uhf-rfid-epc-memory-bank-what-is-the-crc16/) -- CRC-16 residue 0x1D0F validation method
- [CRC catalogue (reveng.sourceforge.io)](https://reveng.sourceforge.io/crc-catalogue/all.htm) -- CRC-16/GENIBUS polynomial confirmation
- [Svelte+Vite+Emscripten integration gist](https://gist.github.com/toiglak/a0c7b4927088ef6263f10201154f02fb) -- WASM loading pattern in Vite worker context
- [Vite+Emscripten+Worker tutorial](https://dev.to/joyhughes/a-simple-web-app-using-vitereact-c-emscripten-webassembly-and-a-web-worker-48ia) -- Worker WASM loading pattern

### Tertiary (LOW confidence)
- [ianhchuang/EPC-Gen2-RFID-Tag-Baseband-Processor](https://github.com/ianhchuang/EPC-Gen2-RFID-Tag-Baseband-Processor) -- Verilog FM0/Miller encoder/decoder (algorithm reference only)
- FM0 backscatter feasibility with RTL-SDR -- theoretical concern from PITFALLS.md research; unverified whether any real-world decode is achievable with 8-bit ADC dynamic range

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Emscripten is well-documented; existing Vite+WASM infrastructure already works in the project
- Architecture: HIGH -- WASM/TS boundary is clearly defined; integration points in existing code are identified
- Protocol details: HIGH -- EPC Gen2 spec is authoritative; command formats and CRC polynomials are well-documented
- PIE demodulation algorithm: MEDIUM -- Algorithm design is sound but untested in browser WASM context at 2.4 MSPS real-time
- FM0 backscatter: LOW -- Theoretical feasibility with RTL-SDR is questionable; experimental status is appropriate
- Pitfalls: HIGH -- Directly informed by prior research and known DSP Worker patterns

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable domain -- EPC Gen2 spec does not change; Emscripten/Vite stable)
