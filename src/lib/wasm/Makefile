# WASM PIE Demodulator Build
#
# Compiles demod.c to demod.mjs (ES6 factory) + demod.wasm via Emscripten.
# Build artifacts (demod.mjs, demod.wasm) are committed to the repo so the
# browser app works without requiring Emscripten to be installed.
#
# Prerequisites: Emscripten SDK (emsdk) installed and activated
# Usage: make          (builds demod.mjs + demod.wasm)
#        make clean    (removes build outputs)

CC = emcc

CFLAGS = -O3 -msimd128 \
         -sEXPORT_ES6=1 -sMODULARIZE=1 \
         -sEXPORTED_FUNCTIONS=_demod_process,_demod_reset,_demod_get_noise_floor,_demod_get_state,_malloc,_free \
         -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32,HEAPF32 \
         -sALLOW_MEMORY_GROWTH=0 \
         -sINITIAL_MEMORY=4194304 \
         -sENVIRONMENT=worker \
         -sNO_FILESYSTEM=1 \
         --no-entry

.PHONY: all clean

all: demod.mjs

demod.mjs: demod.c
	$(CC) $(CFLAGS) -o $@ $<

clean:
	rm -f demod.mjs demod.wasm
