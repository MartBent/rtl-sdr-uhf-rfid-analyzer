# Phase 2: RF Visualization - Research

**Researched:** 2026-03-20
**Domain:** Real-time FFT spectrum display and waterfall spectrogram with Canvas 2D rendering, driven by Web Worker DSP pipeline
**Confidence:** HIGH

## Summary

Phase 2 transforms the Phase 1 "read and discard" DSP Worker skeleton into a real FFT computation engine, and replaces the placeholder panels with live Canvas 2D spectrum and waterfall visualizations. The core challenge is a clean data pipeline: IQ samples flow from the ring buffer into the DSP Worker, which applies a window function, computes the FFT via the already-installed webfft library, converts to dB magnitude, and posts the result to the main thread. The main thread's requestAnimationFrame loop then renders the spectrum line trace and waterfall spectrogram on separate Canvas 2D elements.

All major technology choices are already locked by the user and Phase 1 architecture: webfft for FFT computation, Canvas 2D with ImageData pixel manipulation for the waterfall, a classic line trace for the spectrum, Svelte 5 runes for state, and the existing worker message protocol. The research below focuses on implementation specifics: windowing functions, DC offset removal, the drawImage scrolling technique, colormap generation, and performance auto-degradation.

**Primary recommendation:** Implement the FFT pipeline entirely within the existing DSP Worker using webfft, post Float32Array magnitude data via transferable ArrayBuffer to the main thread, and render with two dedicated Canvas elements -- one for the spectrum line trace (clearRect + lineTo per frame) and one for the waterfall (drawImage self-copy scroll + putImageData for the new row).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Classic line trace spectrum display (power vs frequency), Y-axis in dBFS (-100 to 0 range)
- Adjustable dB range (floor and ceiling) for signal zoom
- Peak hold with decay (fading second trace)
- Subtle gray grid lines with axis labels; frequency axis in absolute MHz
- No zoom/pan -- full 2.4 MHz bandwidth displayed
- Waterfall: newest data at top, scrolls downward
- Blue-to-red heat map color palette (black-blue-cyan-green-yellow-red-white)
- Canvas 2D rendering with ImageData pixel manipulation for waterfall
- Fixed canvas height waterfall, no offscreen buffer or scrollback
- FFT computation in the existing DSP Worker using webfft (already installed)
- Results sent to main thread via postMessage with transferable ArrayBuffer
- Render loop driven by requestAnimationFrame at 60 fps target
- DSP Worker computes FFTs continuously; main thread picks up latest each frame (decoupled)
- New "Display" collapsible panel in sidebar below existing Tuning Panel
- FFT size dropdown (256, 512, 1024, 2048)
- Spectrum averaging control
- dB range min/max adjustment
- Auto-reduce render rate (60 -> 30 -> 15 fps) with throttle indicator
- DSP Worker continues in background; only rendering pauses
- Pre-allocated buffers to minimize GC pressure

### Claude's Discretion
- FFT windowing function (Blackman-Harris, Hann, or other)
- Exact color values for heat map gradient
- Peak hold decay rate
- Spectrum line trace color and styling
- Grid line spacing and label formatting
- Canvas resize handling and DPI scaling
- DC offset removal / IQ imbalance correction approach
- FFT overlap percentage
- Auto-degrade thresholds (when to step down fps)
- Averaging algorithm (exponential moving average vs linear)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VIS-01 | User sees a live spectrum display (FFT) showing signal power across tuned bandwidth | FFT pipeline in DSP Worker -> transferable ArrayBuffer -> Canvas 2D line trace in rAF loop. Windowing, dB conversion, and spectrum rendering patterns documented below. |
| VIS-02 | User sees a live waterfall/spectrogram showing frequency activity over time | Canvas 2D waterfall using drawImage self-copy scroll + single-row ImageData putImageData. Colormap and rendering patterns documented below. |
| VIS-03 | User can adjust FFT size (256, 512, 1024, 2048) | Main thread sends config message to DSP Worker -> worker recreates webfft instance with new size. Display panel with dropdown control. |
| VIS-04 | User can adjust spectrum averaging for noise reduction | Exponential moving average in DSP Worker (single buffer, alpha blend). Control in Display panel. |
| VIS-05 | Waterfall uses color mapping to indicate signal strength | Pre-computed 256-entry RGBA lookup table mapping dB values to blue-to-red gradient. Applied during ImageData row construction. |
</phase_requirements>

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| webfft | 1.0.3 | FFT computation | Already installed. Meta-library auto-selecting fastest FFT impl (JS or WASM+SIMD). Accepts interleaved complex Float32Array input, returns interleaved complex Float32Array output. Power-of-2 sizes 256-131072. |
| Svelte 5 | 5.54.0 | UI components for display controls | Already in use. $state/$props/$derived runes for reactive Display panel. |
| Tailwind CSS | 4.2.2 | Styling for controls and layout | Already in use. Dark theme classes established in Phase 1. |
| Canvas 2D API | native | Spectrum + waterfall rendering | No external dependency. Direct pixel manipulation via ImageData for waterfall, lineTo for spectrum. |

### Supporting (no new dependencies needed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ringbuf.js | 0.4.0 | Ring buffer for IQ data | Already in use. DSP Worker reads from it. No changes needed. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canvas 2D waterfall | WebGL texture scrolling | WebGL is faster for very large waterfalls but adds significant complexity. Canvas 2D with drawImage self-copy is adequate for the fixed-height, no-scrollback design. Upgrade to WebGL only if profiling shows >8ms per waterfall frame. |
| webfft | Custom WASM FFT | webfft already auto-selects WASM+SIMD when available. No benefit to rolling our own FFT for visualization. |
| Canvas 2D spectrum | SVG line | SVG cannot handle 60fps redraws with 1024+ data points. Canvas 2D is the correct choice. |

**Installation:** No new packages required. All dependencies are already installed.

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)
```
src/lib/
  dsp/
    dsp-worker.ts          # MODIFY: Add FFT computation, windowing, averaging, DC removal
    ring-buffer.ts          # NO CHANGE
    fft-processor.ts        # NEW: FFT pipeline logic (window, FFT, magnitude, average)
    window-functions.ts     # NEW: Blackman-Harris and other window implementations
    colormap.ts             # NEW: Pre-computed 256-entry RGBA lookup table
  workers/
    worker-messages.ts      # MODIFY: Add DspToMainMessage types for FFT data + config messages
    worker-bridge.ts        # MODIFY: Route FFT data to visualization state, handle config
  state/
    sdr-state.svelte.ts     # NO CHANGE
    display-state.svelte.ts # NEW: FFT size, averaging, dB range, fps settings
  components/
    SpectrumCanvas.svelte   # NEW: Canvas 2D spectrum line trace + peak hold + grid
    WaterfallCanvas.svelte  # NEW: Canvas 2D waterfall with ImageData scrolling
    DisplayPanel.svelte     # NEW: Collapsible sidebar panel for visualization controls
    PlaceholderPanel.svelte # REMOVE (replaced by actual components)
  viz/
    spectrum-renderer.ts    # NEW: Spectrum drawing logic (line, peak hold, grid, axes)
    waterfall-renderer.ts   # NEW: Waterfall drawing logic (scroll, colormap, row)
  routes/
    +page.svelte            # MODIFY: Replace PlaceholderPanels with real components
```

### Pattern 1: FFT Pipeline in DSP Worker

**What:** The DSP Worker reads IQ samples from the ring buffer, accumulates them into FFT-sized blocks, applies a window function, runs the FFT via webfft, converts to dBFS magnitude, applies exponential moving average, and posts the averaged spectrum to the main thread.

**When to use:** Every poll cycle when new data is available.

**Example:**
```typescript
// dsp/fft-processor.ts
import webfft from 'webfft';

class FftProcessor {
  private fft: webfft;
  private windowCoeffs: Float32Array;
  private avgSpectrum: Float32Array;
  private windowedInput: Float32Array;
  private fftSize: number;
  private alpha: number; // EMA smoothing factor

  constructor(fftSize: number, alpha: number = 0.3) {
    this.fftSize = fftSize;
    this.fft = new webfft(fftSize);
    this.windowCoeffs = generateBlackmanHarris(fftSize);
    this.avgSpectrum = new Float32Array(fftSize);
    this.windowedInput = new Float32Array(fftSize * 2); // interleaved I/Q
    this.alpha = alpha;
  }

  /**
   * Process a block of IQ samples (Uint8Array from ring buffer)
   * into an averaged dBFS magnitude spectrum.
   * Returns null if not enough samples accumulated.
   */
  process(iqBlock: Float32Array): Float32Array {
    // Apply window to interleaved complex input
    for (let i = 0; i < this.fftSize; i++) {
      this.windowedInput[2 * i]     = iqBlock[2 * i]     * this.windowCoeffs[i];
      this.windowedInput[2 * i + 1] = iqBlock[2 * i + 1] * this.windowCoeffs[i];
    }

    // Run FFT (returns interleaved complex output)
    const fftOut = this.fft.fft(this.windowedInput);

    // Convert to dBFS magnitude with FFT shift (center DC)
    const half = this.fftSize / 2;
    for (let i = 0; i < this.fftSize; i++) {
      const shifted = (i + half) % this.fftSize;
      const re = fftOut[2 * shifted];
      const im = fftOut[2 * shifted + 1];
      const mag = Math.sqrt(re * re + im * im) / this.fftSize;
      const db = mag > 0 ? 20 * Math.log10(mag) : -150;

      // Exponential moving average
      this.avgSpectrum[i] = this.alpha * db + (1 - this.alpha) * this.avgSpectrum[i];
    }

    return this.avgSpectrum;
  }

  dispose(): void {
    this.fft.dispose();
  }
}
```

### Pattern 2: Waterfall Canvas 2D drawImage Self-Copy Scroll

**What:** Each frame, the existing waterfall content is scrolled down by one pixel row using `ctx.drawImage(canvas, 0, 0, w, h, 0, 1, w, h)` (the canvas copies itself shifted down by 1 pixel). Then the new FFT row is written as a 1-pixel-high ImageData at y=0 using the colormap lookup table.

**When to use:** On every rAF frame when new FFT data is available.

**Why drawImage over getImageData/putImageData:** drawImage self-copy is a GPU-accelerated operation in modern browsers. getImageData forces a GPU->CPU readback which is slow. The drawImage approach keeps all existing pixel data on the GPU.

**Example:**
```typescript
// viz/waterfall-renderer.ts
class WaterfallRenderer {
  private ctx: CanvasRenderingContext2D;
  private rowImageData: ImageData;
  private colormap: Uint8Array; // 256 * 4 (RGBA) entries
  private width: number;
  private height: number;

  constructor(canvas: HTMLCanvasElement, colormap: Uint8Array) {
    this.ctx = canvas.getContext('2d')!;
    this.width = canvas.width;
    this.height = canvas.height;
    this.colormap = colormap;
    this.rowImageData = this.ctx.createImageData(this.width, 1);
  }

  drawRow(spectrumDb: Float32Array, dbMin: number, dbMax: number): void {
    const { ctx, width, height, rowImageData, colormap } = this;
    const pixels = rowImageData.data;
    const dbRange = dbMax - dbMin;
    const binCount = spectrumDb.length;

    // Map spectrum bins to pixel columns (may need interpolation)
    for (let x = 0; x < width; x++) {
      const binIndex = Math.floor((x / width) * binCount);
      const db = spectrumDb[binIndex];
      // Normalize to 0-255 colormap index
      const normalized = Math.max(0, Math.min(255,
        Math.floor(((db - dbMin) / dbRange) * 255)
      ));
      const cmapOffset = normalized * 4;
      const pxOffset = x * 4;
      pixels[pxOffset]     = colormap[cmapOffset];     // R
      pixels[pxOffset + 1] = colormap[cmapOffset + 1]; // G
      pixels[pxOffset + 2] = colormap[cmapOffset + 2]; // B
      pixels[pxOffset + 3] = 255;                      // A
    }

    // Scroll existing content down by 1 pixel (GPU-accelerated)
    ctx.drawImage(ctx.canvas, 0, 0, width, height, 0, 1, width, height);

    // Draw new row at the top
    ctx.putImageData(rowImageData, 0, 0);
  }
}
```

### Pattern 3: Spectrum Line Trace with Peak Hold

**What:** Clear the canvas, draw grid lines, then draw the spectrum as a single polyline path. Separately maintain a peak hold buffer that decays over time and draw it as a second, fainter line.

**Example:**
```typescript
// viz/spectrum-renderer.ts
class SpectrumRenderer {
  private ctx: CanvasRenderingContext2D;
  private peakHold: Float32Array;
  private decayRate: number; // dB per frame, e.g., 0.5

  drawFrame(spectrum: Float32Array, dbMin: number, dbMax: number): void {
    const { ctx, peakHold } = this;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const dbRange = dbMax - dbMin;
    const binCount = spectrum.length;

    ctx.clearRect(0, 0, w, h);
    this.drawGrid(dbMin, dbMax);

    // Update peak hold
    for (let i = 0; i < binCount; i++) {
      if (spectrum[i] > peakHold[i]) {
        peakHold[i] = spectrum[i];
      } else {
        peakHold[i] -= this.decayRate;
      }
    }

    // Draw peak hold trace (faded)
    this.drawTrace(peakHold, dbMin, dbRange, w, h, binCount, 'rgba(255,255,0,0.3)');

    // Draw main spectrum trace
    this.drawTrace(spectrum, dbMin, dbRange, w, h, binCount, '#00ff88');
  }

  private drawTrace(
    data: Float32Array, dbMin: number, dbRange: number,
    w: number, h: number, binCount: number, color: string
  ): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    for (let i = 0; i < binCount; i++) {
      const x = (i / binCount) * w;
      const y = h - ((data[i] - dbMin) / dbRange) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
```

### Pattern 4: Main Thread Render Loop with Auto-Degrade

**What:** A single requestAnimationFrame loop that measures frame time. If frames consistently exceed budget (16.6ms for 60fps), the loop self-throttles to 30fps (skips every other frame), then 15fps. A throttle indicator appears in the UI.

**Example:**
```typescript
// In the Svelte component or a renderer coordinator
let targetInterval = 1000 / 60; // 16.6ms
let frameCount = 0;
let slowFrames = 0;

function renderLoop(timestamp: number): void {
  const delta = timestamp - lastTimestamp;

  if (delta >= targetInterval) {
    lastTimestamp = timestamp;

    // Render spectrum + waterfall with latest FFT data
    if (latestFftData) {
      spectrumRenderer.drawFrame(latestFftData, dbMin, dbMax);
      waterfallRenderer.drawRow(latestFftData, dbMin, dbMax);
      latestFftData = null;
    }

    // Track performance
    frameCount++;
    if (delta > targetInterval * 1.5) slowFrames++;

    // Every 60 frames, evaluate
    if (frameCount >= 60) {
      if (slowFrames > 15 && targetInterval < 67) {
        targetInterval *= 2; // Degrade: 60->30->15
      }
      frameCount = 0;
      slowFrames = 0;
    }
  }

  requestAnimationFrame(renderLoop);
}
```

### Anti-Patterns to Avoid

- **Rendering on message arrival:** Never call canvas draw functions inside the DSP Worker's message handler. Store the data and render only in rAF.
- **Creating new Float32Array per FFT frame:** Pre-allocate all buffers. The DSP Worker should reuse buffers and transfer ownership to the main thread, or copy into a pre-allocated main-thread buffer.
- **Calling getImageData for waterfall scrolling:** This forces GPU readback. Use drawImage self-copy instead.
- **Resizing canvas on every frame:** Set canvas dimensions only on window resize events, not per frame. Use a ResizeObserver.
- **Running webfft.profile() on every instantiation:** Profile once on app start and cache the result. webfft stores the profile in localStorage automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FFT computation | Custom FFT implementation | webfft (already installed) | Meta-library benchmarks multiple FFT implementations and selects the fastest for the user's browser. WASM+SIMD when available. |
| Window functions | Copy-paste from StackOverflow | Implement from formula (4 coefficients for Blackman-Harris) | Window functions are simple math but must be precise. The 4-term Blackman-Harris formula is well-defined and only ~10 lines of code. |
| Colormap generation | Manual RGB interpolation per frame | Pre-computed 256-entry RGBA Uint8Array lookup table | Computing colors per-pixel per-frame is wasteful. A 1KB lookup table eliminates all per-frame color math. |
| Canvas DPI scaling | Ignoring devicePixelRatio | Set canvas.width/height to CSS size * devicePixelRatio, then scale ctx | Failing to handle DPI produces blurry canvases on Retina/HiDPI displays. |
| Spectrum averaging | Rolling buffer of N frames | Exponential moving average (EMA) with alpha parameter | EMA uses O(1) memory (single buffer), converges smoothly, and the alpha parameter maps intuitively to "smoothing amount". |

**Key insight:** The FFT visualization pipeline is entirely standard SDR tool infrastructure. Every SDR tool (SDR#, GQRX, OpenWebRX) implements the same pattern. The only novel aspect is doing it in a Web Worker with webfft.

## Common Pitfalls

### Pitfall 1: RTL-SDR DC Offset Spike
**What goes wrong:** A large spike appears at the center frequency (DC bin) of the spectrum, obscuring real signals.
**Why it happens:** RTL-SDR direct conversion receivers have LO leakage that creates a DC offset in the IQ samples. The RTL2832U's 8-bit ADC also has a slight DC bias (~127.5 instead of 128.0 for zero).
**How to avoid:** Subtract the running mean from each I and Q channel before windowing/FFT. Use a simple IIR filter: `dc_i = dc_i * 0.999 + sample_i * 0.001; corrected_i = sample_i - dc_i;` This converges within a few hundred samples and tracks slow drift. Apply identically to Q channel.
**Warning signs:** Persistent spike at center frequency regardless of antenna/signal conditions.

### Pitfall 2: FFT Spectral Leakage Without Windowing
**What goes wrong:** Signals appear much wider than they actually are, and weak signals near strong ones are masked.
**Why it happens:** The FFT assumes the input is periodic. Without a window function, discontinuities at block boundaries cause spectral leakage -- energy "smears" across many frequency bins.
**How to avoid:** Apply a window function before every FFT. Use the 4-term Blackman-Harris window for best dynamic range (~92 dB sidelobe attenuation). This is ideal for SDR spectrum analyzers where you need to see weak signals near strong ones. Hann is acceptable but has only ~31 dB sidelobe attenuation.
**Warning signs:** RFID reader signals appear as broad humps instead of sharp peaks.

### Pitfall 3: Missing FFT Shift (fftshift)
**What goes wrong:** The spectrum display shows DC at the left edge instead of at the center. Negative frequencies appear on the right side.
**Why it happens:** Standard FFT output has DC at index 0, positive frequencies in the first half, and negative frequencies in the second half. For a centered spectrum display (standard SDR convention), the output must be shifted so DC is at the center.
**How to avoid:** Apply fftshift: swap the first and second halves of the magnitude array. For an FFT of size N, bin i in the display corresponds to FFT output bin `(i + N/2) % N`.
**Warning signs:** Spectrum looks "split" with expected signals appearing on the wrong side.

### Pitfall 4: IQ Sample Format Mismatch
**What goes wrong:** FFT output is garbage -- random noise with no recognizable signal structure.
**Why it happens:** RTL-SDR produces unsigned 8-bit IQ samples (0-255, center at ~128). webfft expects interleaved Float32 complex samples (IQIQIQ format). Developers forget to convert: `float_i = (uint8_i - 127.5) / 127.5` and similarly for Q.
**How to avoid:** Convert Uint8Array from ring buffer to Float32Array with proper scaling before FFT. Pre-allocate the Float32Array conversion buffer to avoid GC.
**Warning signs:** Spectrum shows flat noise floor with no visible signals even when antenna is connected.

### Pitfall 5: Waterfall Memory Leak from ImageData Allocation
**What goes wrong:** Memory usage climbs steadily during capture, eventually causing tab crash.
**Why it happens:** Calling `ctx.createImageData(width, 1)` on every frame allocates a new ImageData object. At 60fps, that's 60 allocations/second of width*4 bytes each, all needing GC.
**How to avoid:** Create the ImageData object ONCE in the constructor. Reuse it every frame by writing directly into its `.data` Uint8ClampedArray.
**Warning signs:** Growing memory usage visible in Chrome DevTools Memory tab during capture.

### Pitfall 6: Canvas Blurriness on HiDPI Displays
**What goes wrong:** The spectrum and waterfall look blurry on Retina/4K displays.
**Why it happens:** Canvas CSS size and internal pixel dimensions are different on HiDPI. If canvas.width equals CSS width, each canvas pixel maps to multiple display pixels, causing upscaling blur.
**How to avoid:** Multiply canvas.width and canvas.height by `window.devicePixelRatio`. Use CSS to set the visual size. Scale the context with `ctx.scale(dpr, dpr)` for the spectrum (or account for DPR in all coordinate calculations). For the waterfall, work in actual pixel dimensions (the pixel data IS the visualization).
**Warning signs:** Blurry text on axis labels, fuzzy spectrum line.

## Code Examples

### IQ Sample Conversion (Uint8 to Float32 with DC removal)
```typescript
// dsp/fft-processor.ts
// Pre-allocated buffers
const iqFloat = new Float32Array(fftSize * 2);
let dcI = 0;
let dcQ = 0;
const DC_ALPHA = 0.001; // DC tracking filter coefficient

function convertIqBlock(raw: Uint8Array, offset: number, count: number): Float32Array {
  for (let i = 0; i < count; i++) {
    const rawI = raw[offset + i * 2];
    const rawQ = raw[offset + i * 2 + 1];

    // Convert unsigned 8-bit to float [-1, 1]
    const fI = (rawI - 127.5) / 127.5;
    const fQ = (rawQ - 127.5) / 127.5;

    // DC removal via IIR filter
    dcI = dcI * (1 - DC_ALPHA) + fI * DC_ALPHA;
    dcQ = dcQ * (1 - DC_ALPHA) + fQ * DC_ALPHA;

    iqFloat[i * 2]     = fI - dcI;
    iqFloat[i * 2 + 1] = fQ - dcQ;
  }
  return iqFloat;
}
```

### Blackman-Harris Window Function
```typescript
// dsp/window-functions.ts
/**
 * Generate a 4-term Blackman-Harris window.
 * ~92 dB sidelobe attenuation -- ideal for SDR spectrum display.
 *
 * Reference: F.J. Harris, "On the Use of Windows for Harmonic Analysis
 * with the Discrete Fourier Transform," Proc. IEEE, 1978.
 */
export function generateBlackmanHarris(size: number): Float32Array {
  const w = new Float32Array(size);
  const a0 = 0.35875;
  const a1 = 0.48829;
  const a2 = 0.14128;
  const a3 = 0.01168;
  const N = size - 1;

  for (let n = 0; n < size; n++) {
    const x = (2 * Math.PI * n) / N;
    w[n] = a0 - a1 * Math.cos(x) + a2 * Math.cos(2 * x) - a3 * Math.cos(3 * x);
  }
  return w;
}
```

### Pre-computed Colormap (Blue-to-Red Heat Map)
```typescript
// dsp/colormap.ts
/**
 * Generate a 256-entry RGBA colormap: black -> blue -> cyan -> green -> yellow -> red -> white.
 * Returns Uint8Array of length 1024 (256 entries * 4 bytes RGBA).
 */
export function generateHeatmapColormap(): Uint8Array {
  const cmap = new Uint8Array(256 * 4);

  // Color stops: [position (0-1), R, G, B]
  const stops: [number, number, number, number][] = [
    [0.00, 0,   0,   0  ],  // black
    [0.15, 0,   0,   128],  // dark blue
    [0.30, 0,   0,   255],  // blue
    [0.40, 0,   255, 255],  // cyan
    [0.55, 0,   255, 0  ],  // green
    [0.70, 255, 255, 0  ],  // yellow
    [0.85, 255, 0,   0  ],  // red
    [1.00, 255, 255, 255],  // white
  ];

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    // Find surrounding stops
    let lo = 0;
    for (let s = 1; s < stops.length; s++) {
      if (stops[s][0] >= t) { lo = s - 1; break; }
    }
    const hi = lo + 1;
    const range = stops[hi][0] - stops[lo][0];
    const frac = range > 0 ? (t - stops[lo][0]) / range : 0;

    const offset = i * 4;
    cmap[offset]     = Math.round(stops[lo][1] + frac * (stops[hi][1] - stops[lo][1]));
    cmap[offset + 1] = Math.round(stops[lo][2] + frac * (stops[hi][2] - stops[lo][2]));
    cmap[offset + 2] = Math.round(stops[lo][3] + frac * (stops[hi][3] - stops[lo][3]));
    cmap[offset + 3] = 255;
  }
  return cmap;
}
```

### Worker Message Types (new additions)
```typescript
// workers/worker-messages.ts additions
export type MainToDspMessage =
  | { type: 'set-fft-size'; size: number }
  | { type: 'set-averaging'; alpha: number };

export type DspToMainMessage =
  | { type: 'dsp-ready' }
  | { type: 'dsp-stats'; samplesProcessed: number }
  | { type: 'fft-data'; bins: Float32Array; binCount: number; centerFrequency: number; sampleRate: number };
  // bins is transferred (zero-copy), not cloned
```

### Transferable ArrayBuffer Pattern
```typescript
// In DSP Worker -- posting FFT data with transfer
const spectrumCopy = new Float32Array(avgSpectrum.length);
spectrumCopy.set(avgSpectrum);

postToMain({
  type: 'fft-data',
  bins: spectrumCopy,
  binCount: fftSize,
  centerFrequency: currentCenterFreq,
  sampleRate: currentSampleRate,
} as DspToMainMessage, [spectrumCopy.buffer]); // Transfer the buffer
```

### Canvas DPI Scaling Pattern
```typescript
// Used in both SpectrumCanvas.svelte and WaterfallCanvas.svelte
function setupCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext('2d')!;
  // For spectrum: scale context so drawing coordinates match CSS pixels
  // For waterfall: work directly in device pixels (pixel data IS the visualization)
  return ctx;
}
```

## Discretion Recommendations

These are the areas where the user gave Claude discretion. Research-backed recommendations:

### FFT Windowing: Blackman-Harris (4-term)
**Recommendation:** Use the 4-term Blackman-Harris window.
**Rationale:** For SDR spectrum analyzers, dynamic range is more important than frequency resolution. Blackman-Harris provides ~92 dB sidelobe attenuation vs Hann's ~31 dB. This means weak RFID signals 90 dB below a strong reader transmission will still be visible, not buried in sidelobes. The 2x wider main lobe is irrelevant at our frequency resolution (2.4 MHz / 1024 bins = 2.3 kHz per bin -- far finer than needed for RFID).
**Confidence:** HIGH (standard choice in SDR tools like SDR#, GQRX)

### Averaging: Exponential Moving Average (EMA)
**Recommendation:** Use EMA with configurable alpha (default 0.3).
**Rationale:** EMA uses O(1) memory (single Float32Array), needs no history buffer, and provides smooth visual averaging. Alpha=0.3 means ~70% of previous frame retained -- fast enough to see RFID burst dynamics, smooth enough to reduce noise. Linear averaging requires storing N frames, uses O(N) memory, and has a hard "window" edge.
**Confidence:** HIGH

### Peak Hold Decay Rate
**Recommendation:** 0.3 dB per frame at 60fps (18 dB/sec decay).
**Rationale:** At this rate, a peak from a brief RFID reader transmission (~500us) remains visible for about 5 seconds before fading back to the noise floor. Fast enough to not clutter the display, slow enough to be useful for identifying intermittent signals.
**Confidence:** MEDIUM (tunable, may need adjustment with real signals)

### Spectrum Line Color and Styling
**Recommendation:** Main trace: `#00ff88` (bright green), 1px line. Peak hold: `rgba(255, 200, 0, 0.3)` (faded amber), 1px line. Background: match existing `bg-gray-900`. Grid: `rgba(255, 255, 255, 0.08)`.
**Rationale:** Green-on-dark is the classic SDR spectrum analyzer color (SDR#, GQRX, Spectrum Lab). High contrast against dark background. Amber peak hold distinguishes clearly from the green trace.
**Confidence:** MEDIUM (aesthetic choice)

### Grid Line Spacing
**Recommendation:** Horizontal (dB): every 10 dB. Vertical (frequency): every 0.5 MHz for 2.4 MHz bandwidth. Labels in 10pt monospace, gray-500 color.
**Rationale:** 10 dB per division is standard for spectrum analyzers. 0.5 MHz gives 4-5 vertical divisions across 2.4 MHz, not too cluttered.
**Confidence:** HIGH (standard SDR conventions)

### DC Offset Removal
**Recommendation:** IIR high-pass filter with alpha=0.001 applied to both I and Q channels before windowing. `dc = dc * 0.999 + sample * 0.001; corrected = sample - dc;`
**Rationale:** Simple, effective, converges in <1000 samples (~0.4ms at 2.4 MSPS). Tracks slow DC drift. Does not affect signal content above ~100 Hz.
**Confidence:** HIGH (standard technique used in GNU Radio's CorrectIQ, SDR#)

### FFT Overlap
**Recommendation:** 0% overlap (non-overlapping blocks).
**Rationale:** At 2.4 MSPS with 1024-point FFT, we get ~2340 FFTs/second without overlap. We only display 30-60/second. There is zero benefit to overlap since we're massively over-producing FFT frames. Overlap would waste CPU. The averaging takes care of temporal smoothing.
**Confidence:** HIGH

### Auto-Degrade Thresholds
**Recommendation:** After 60 frames, if >25% of frames exceeded 1.5x target interval, step down one tier (60->30->15 fps). Recovery: after 120 frames at reduced rate with <10% slow frames, step back up. Display a small "30fps" or "15fps" indicator in the status area.
**Rationale:** 25% threshold avoids reacting to occasional GC pauses. 120-frame recovery window prevents oscillation between rates.
**Confidence:** MEDIUM (will need tuning with real hardware)

### Canvas Resize Handling
**Recommendation:** Use a ResizeObserver on the canvas container. On resize, update canvas width/height (accounting for DPI), recreate the waterfall ImageData row buffer (if width changed), and clear the waterfall canvas. Debounce resize to 100ms.
**Rationale:** ResizeObserver is the correct modern API. Clearing the waterfall on resize avoids stretched/distorted content. The spectrum redraws every frame anyway so no special handling needed.
**Confidence:** HIGH

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| getImageData + putImageData for waterfall scroll | drawImage self-copy | Always better, but commonly documented incorrectly | 5-10x faster waterfall scrolling due to GPU acceleration |
| Manual FFT implementations in JS | webfft meta-library (auto-selects WASM+SIMD) | webfft 1.0 released 2024 | Eliminates need to choose/maintain FFT library |
| Single-thread FFT + render | Worker-based FFT + rAF render loop | Standard since Web Workers matured | Decoupled pipeline prevents render jank from DSP load |
| Rectangular window or Hann | Blackman-Harris for SDR | Long-standing SDR best practice | 60 dB better sidelobe rejection |

## Open Questions

1. **webfft in Web Worker with WASM sub-libraries**
   - What we know: webfft works in main thread. It auto-detects WASM+SIMD support.
   - What's unclear: Whether webfft's WASM sub-libraries load correctly inside a Web Worker (WASM instantiation may differ in worker context). The webfft README does not explicitly document worker usage.
   - Recommendation: Test webfft instantiation in the DSP Worker early. If WASM loading fails in worker context, fall back to JavaScript sub-library explicitly: `new webfft(1024, 'indutnyJavascript', false)`. The JS implementations are still fast enough for our 30-60 FFTs/second display rate.

2. **webfft profiling in worker context**
   - What we know: webfft profiles on construction if a cached profile exists in localStorage.
   - What's unclear: Workers don't have localStorage access. The profiling/caching mechanism may not work in a worker.
   - Recommendation: Either run `fft.profile()` once on the main thread during app init (webfft stores results in localStorage), then the worker can benefit from cached results. Or explicitly set the sub-library in the worker: `new webfft(size, 'kissWasm', false)` to skip profiling.

3. **Exact UsbToDsp message: sampleRate and centerFrequency**
   - What we know: The `capture-started` message already includes `sampleRate` and `centerFrequency` (hardcoded to 2,400,000 and 866,500,000 in current code).
   - What's unclear: When the user changes frequency/gain mid-capture via TuningPanel, does the USB Worker send an updated message to DSP? Currently it does not.
   - Recommendation: Add a `config-updated` UsbToDsp message type, or route frequency changes through MainToDsp. The DSP Worker needs current centerFrequency to include it in FFT data messages so the spectrum renderer can label the frequency axis correctly.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIS-01 | FFT pipeline produces valid dBFS spectrum from IQ samples | unit | `vitest run src/lib/dsp/fft-processor.test.ts -t "produces valid spectrum"` | Wave 0 |
| VIS-01 | Spectrum renderer draws line trace on canvas | unit | `vitest run src/lib/viz/spectrum-renderer.test.ts -t "draws spectrum"` | Wave 0 |
| VIS-02 | Waterfall renderer scrolls and draws new row | unit | `vitest run src/lib/viz/waterfall-renderer.test.ts -t "draws waterfall row"` | Wave 0 |
| VIS-03 | FFT size change reinitializes processor | unit | `vitest run src/lib/dsp/fft-processor.test.ts -t "handles size change"` | Wave 0 |
| VIS-04 | EMA averaging smooths spectrum | unit | `vitest run src/lib/dsp/fft-processor.test.ts -t "averaging smooths"` | Wave 0 |
| VIS-05 | Colormap generates valid 256-entry RGBA table | unit | `vitest run src/lib/dsp/colormap.test.ts -t "generates colormap"` | Wave 0 |
| VIS-05 | Colormap correctly maps dB to color | unit | `vitest run src/lib/dsp/colormap.test.ts -t "maps dB to color"` | Wave 0 |
| N/A | Window function generates correct Blackman-Harris coefficients | unit | `vitest run src/lib/dsp/window-functions.test.ts -t "blackman-harris"` | Wave 0 |
| N/A | DC removal filter converges and removes offset | unit | `vitest run src/lib/dsp/fft-processor.test.ts -t "dc removal"` | Wave 0 |
| N/A | Display state reactivity (FFT size, averaging, dB range) | unit | `vitest run src/lib/state/display-state.test.ts` | Wave 0 |
| N/A | Worker message types compile and are correctly typed | unit | `vitest run src/lib/workers/worker-messages.test.ts` | Existing (extend) |

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/dsp/fft-processor.test.ts` -- covers VIS-01, VIS-03, VIS-04, DC removal
- [ ] `src/lib/dsp/window-functions.test.ts` -- covers Blackman-Harris correctness
- [ ] `src/lib/dsp/colormap.test.ts` -- covers VIS-05
- [ ] `src/lib/viz/spectrum-renderer.test.ts` -- covers VIS-01 rendering
- [ ] `src/lib/viz/waterfall-renderer.test.ts` -- covers VIS-02 rendering
- [ ] `src/lib/state/display-state.test.ts` -- covers display state reactivity

Note: Canvas-based tests require a canvas mock or jsdom/happy-dom environment. The existing vitest config uses `environment: 'node'` which lacks Canvas API. Options: (a) test renderer logic with a mock 2D context, or (b) add `@vitest/browser` for real browser testing. Recommend option (a) for unit tests -- mock `CanvasRenderingContext2D` methods and verify calls.

## Sources

### Primary (HIGH confidence)
- [webfft npm package](https://www.npmjs.com/package/webfft) - v1.0.3 verified installed, API from type definitions
- [webfft README](https://github.com/IQEngine/WebFFT) - Usage patterns, interleaved complex format, profiling
- [MDN Canvas 2D API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) - ImageData, drawImage, putImageData
- [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame) - Render loop pattern
- [F.J. Harris, "On the Use of Windows..."](https://www.cs.cmu.edu/afs/cs/user/bhiksha/WWW/courses/dsp/spring2013/WWW/schedule/readings/windows_comparison2_harris.pdf) - Blackman-Harris coefficients
- Phase 1 source code (dsp-worker.ts, worker-messages.ts, worker-bridge.ts) - Existing patterns and integration points

### Secondary (MEDIUM confidence)
- [RTL-SDR DC Spike Removal](https://www.rtl-sdr.com/removing-that-center-frequency-dc-spike-in-gnuradio-the-easy-way/) - DC offset removal technique verified against GNU Radio CorrectIQ
- [jledet/waterfall](https://github.com/jledet/waterfall) - Canvas waterfall reference implementation
- [Spectrogram in JavaScript](https://www.arc.id.au/Spectrogram.html) - Canvas spectrogram rendering patterns
- [MeasureThat: PutImageData vs DrawImage benchmark](https://www.measurethat.net/Benchmarks/Show/9510/0/putimagedata-vs-drawimage) - Performance comparison
- [PySDR: Frequency Domain](https://pysdr.org/content/frequency_domain.html) - FFT windowing and spectral analysis background

### Tertiary (LOW confidence)
- [Real-Time Audio Spectrograms in the Browser](https://dev.to/hexshift/real-time-audio-spectrograms-in-the-browser-using-web-audio-api-and-canvas-4b2d) - General pattern reference (audio domain, not SDR)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - webfft already installed, Canvas 2D is native, no new dependencies
- Architecture: HIGH - extends well-established Phase 1 worker pattern with known FFT pipeline
- Pitfalls: HIGH - DC offset, spectral leakage, FFT shift are well-documented SDR fundamentals
- Discretion items: MEDIUM-HIGH - recommendations based on standard SDR tool conventions, may need fine-tuning
- webfft in Worker: MEDIUM - untested in this specific worker context, but low-risk fallback available

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable domain, no fast-moving dependencies)
