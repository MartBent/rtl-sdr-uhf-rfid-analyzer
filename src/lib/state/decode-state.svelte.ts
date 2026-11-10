/**
 * Decode State - Decoded command ring buffer and statistics
 *
 * Manages the state for decoded EPC Gen2 commands, backscatter results,
 * inventory round updates, and decode statistics. Uses a ring buffer pattern
 * (array slice) to prevent unbounded growth during long capture sessions.
 *
 * Follows the established Svelte 5 $state pattern from sdr-state.svelte.ts
 * and display-state.svelte.ts.
 */

import type { Gen2Command, RoundUpdate, BackscatterResult } from '$lib/protocol/gen2-types';

/** Maximum decoded commands kept in ring buffer. Older entries are overwritten. */
const MAX_COMMANDS = 5000;

/** Maximum backscatter results kept. */
const MAX_BACKSCATTER = 1000;

/** Maximum round updates kept. */
const MAX_ROUNDS = 500;

export const decodeState = $state({
	/** Ring buffer of decoded commands (newest at end). */
	commands: [] as Gen2Command[],

	/** Ring buffer of backscatter decode attempts. */
	backscatter: [] as BackscatterResult[],

	/** Current round updates for UI display. */
	rounds: [] as RoundUpdate[],

	/** Decode statistics. */
	stats: {
		totalCommands: 0,
		crcChecked: 0,
		crcPassed: 0,
		commandsPerSec: 0,
		detectedTari: 0, // in microseconds
	},

	/** Whether backscatter display is enabled (off by default per CONTEXT.md). */
	showBackscatter: false,

	/** Whether decoding is active. */
	active: false,
});

/**
 * Push new decoded commands into the ring buffer.
 * Trims to MAX_COMMANDS capacity.
 */
export function pushDecodedCommands(commands: Gen2Command[]): void {
	decodeState.commands = [...decodeState.commands, ...commands].slice(-MAX_COMMANDS);
}

/**
 * Push backscatter results into the ring buffer.
 * Trims to MAX_BACKSCATTER capacity.
 */
export function pushBackscatterResults(results: BackscatterResult[]): void {
	decodeState.backscatter = [...decodeState.backscatter, ...results].slice(-MAX_BACKSCATTER);
}

/**
 * Push round tracking updates.
 * Trims to MAX_ROUNDS capacity.
 */
export function pushRoundUpdates(updates: RoundUpdate[]): void {
	decodeState.rounds = [...decodeState.rounds, ...updates].slice(-MAX_ROUNDS);
}

/**
 * Update decode statistics from DSP Worker.
 */
export function updateDecodeStats(stats: {
	totalCommands: number;
	crcPassRate: number;
	commandsPerSec: number;
	detectedTari: number;
}): void {
	decodeState.stats.totalCommands = stats.totalCommands;
	decodeState.stats.crcPassed = Math.round(stats.crcPassRate * decodeState.stats.crcChecked);
	decodeState.stats.commandsPerSec = stats.commandsPerSec;
	decodeState.stats.detectedTari = stats.detectedTari;
}

/**
 * Toggle backscatter display.
 */
export function setShowBackscatter(show: boolean): void {
	decodeState.showBackscatter = show;
}

/**
 * Set decode active state.
 */
export function setDecodeActive(active: boolean): void {
	decodeState.active = active;
}

/**
 * Clear the commands timeline (commands, backscatter, rounds) without resetting stats or active state.
 */
export function clearCommandTimeline(): void {
	decodeState.commands = [];
	decodeState.backscatter = [];
	decodeState.rounds = [];
}

/**
 * Reset all decode state (on capture stop or new session).
 */
export function resetDecodeState(): void {
	decodeState.commands = [];
	decodeState.backscatter = [];
	decodeState.rounds = [];
	decodeState.stats.totalCommands = 0;
	decodeState.stats.crcChecked = 0;
	decodeState.stats.crcPassed = 0;
	decodeState.stats.commandsPerSec = 0;
	decodeState.stats.detectedTari = 0;
	decodeState.active = false;
}
