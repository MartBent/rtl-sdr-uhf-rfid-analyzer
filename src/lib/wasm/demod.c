/**
 * WASM PIE Demodulator: Envelope Detection with Hysteresis Noise Gate
 *
 * Hot-path signal processing for EPC Gen2 UHF RFID reader-to-tag decoding.
 * Converts raw uint8 IQ samples into pulse timing events (DemodSymbol).
 *
 * Key design:
 * - Persistent state across process() calls (no reset between chunks)
 * - Hysteresis edge detection prevents oscillation near threshold
 * - Slow IIR noise floor tracking adapts to varying signal conditions
 * - Fixed 4MB WASM heap (no memory growth = no HEAP view invalidation)
 *
 * Compiled via Emscripten: emcc -O3 -msimd128 -> demod.mjs + demod.wasm
 */

#include <emscripten.h>
#include <math.h>
#include <stdint.h>

/* Output struct: 16 bytes, packed for easy HEAP32/HEAPF32 reading from JS */
typedef struct {
    int32_t sample_offset;      /* Global sample position where pulse starts */
    int32_t duration_samples;   /* Pulse width in samples */
    int32_t symbol_type;        /* 0 = pulse-low, 1 = pulse-high */
    float   amplitude;          /* Envelope amplitude at edge transition */
} DemodSymbol;

/* Persistent state (survives across process() calls -- critical per Pitfall 4) */
static float noise_floor = 0.01f;
static int   last_edge_sample = 0;
static int   edge_state = 0;           /* 0 = below threshold, 1 = above */
static float threshold_high = 0.0f;
static float threshold_low = 0.0f;
static int   sample_counter = 0;       /* Running count across calls */

/**
 * Process raw IQ samples and detect envelope edges.
 *
 * @param iq_data           Pointer to uint8 IQ pairs (I0,Q0,I1,Q1,...)
 * @param byte_count        Number of bytes in iq_data (samples = byte_count / 2)
 * @param sample_rate       Sample rate in Hz (for future timing calculations)
 * @param output            Pointer to DemodSymbol output buffer
 * @param global_sample_offset  Added to sample_offset for continuous timing across calls
 * @return                  Number of symbols written to output buffer
 */
EMSCRIPTEN_KEEPALIVE
int demod_process(
    const uint8_t* iq_data,
    int byte_count,
    int sample_rate,
    DemodSymbol* output,
    int global_sample_offset
) {
    int sample_count = byte_count / 2;
    int symbol_count = 0;
    const float noise_alpha = 0.01f;

    (void)sample_rate; /* Reserved for future use */

    for (int i = 0; i < sample_count; i++) {
        /* Convert uint8 IQ to float [-1, 1] */
        float iVal = ((float)iq_data[i * 2] - 127.5f) / 127.5f;
        float qVal = ((float)iq_data[i * 2 + 1] - 127.5f) / 127.5f;

        /* Compute envelope magnitude */
        float env = sqrtf(iVal * iVal + qVal * qVal);

        /* Track noise floor with slow IIR filter */
        noise_floor = noise_floor * (1.0f - noise_alpha) + env * noise_alpha;

        /* Hysteresis thresholds */
        threshold_high = noise_floor * 3.0f;
        threshold_low  = noise_floor * 2.0f;

        /* Edge detection with hysteresis */
        int new_state = edge_state;
        if (edge_state == 0 && env > threshold_high) {
            new_state = 1; /* Rising edge */
        } else if (edge_state == 1 && env < threshold_low) {
            new_state = 0; /* Falling edge */
        }

        if (new_state != edge_state) {
            /* Record the pulse we are leaving */
            int duration = (sample_counter + i) - last_edge_sample;
            if (duration > 0) {
                output[symbol_count].sample_offset    = last_edge_sample + global_sample_offset;
                output[symbol_count].duration_samples  = duration;
                output[symbol_count].symbol_type       = edge_state;  /* State we are leaving */
                output[symbol_count].amplitude         = env;
                symbol_count++;
            }
            last_edge_sample = sample_counter + i;
            edge_state = new_state;
        }
    }

    sample_counter += sample_count;

    return symbol_count;
}

/**
 * Reset all persistent state for a new capture session.
 */
EMSCRIPTEN_KEEPALIVE
void demod_reset(void) {
    noise_floor      = 0.01f;
    last_edge_sample = 0;
    edge_state       = 0;
    threshold_high   = 0.0f;
    threshold_low    = 0.0f;
    sample_counter   = 0;
}

/**
 * Return current noise floor estimate (for debugging/display).
 */
EMSCRIPTEN_KEEPALIVE
float demod_get_noise_floor(void) {
    return noise_floor;
}

/**
 * Return current edge state: 0 = below threshold, 1 = above (for debugging).
 */
EMSCRIPTEN_KEEPALIVE
int demod_get_state(void) {
    return edge_state;
}
