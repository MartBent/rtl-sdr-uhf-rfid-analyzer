# Deferred Items - Phase 03

## Pre-existing Test Failures (from incomplete 03-03 execution)

1. **fm0-decoder.test.ts: "decodes known bit pattern from synthetic FM0 signal with high confidence"**
   - Test expects exact bit-for-bit match of decoded FM0 signal
   - Decoder returns correct confidence (0.958) but bit pattern has mismatches
   - Root cause: FM0 decoder correlation/decoding algorithm needs tuning

2. **fm0-decoder.test.ts: "returns null for random noise samples (confidence below 50%)"**
   - Low-amplitude noise produces a result with confidence 0.958 instead of null
   - Root cause: Confidence calculation in fm0-decoder.ts overestimates quality on noise
   - The FM0 decoder is labeled "experimental" per plan

These were discovered during 03-04 execution but are out of scope (pre-existing, not caused by 03-04 changes).
