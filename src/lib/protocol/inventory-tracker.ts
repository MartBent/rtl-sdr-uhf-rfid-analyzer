/**
 * EPC Gen2 Inventory Round Tracker
 *
 * Groups decoded commands into logical inventory rounds based on the
 * Query-as-boundary rule: each Query command starts a new round.
 * Tracks whether rounds are complete (have a corresponding ACK).
 *
 * Usage:
 *   const tracker = new InventoryTracker();
 *   for (const cmd of decodedCommands) {
 *     const roundUpdate = tracker.processCommand(cmd);
 *     if (roundUpdate) { // previous round just ended }
 *   }
 */

import type { Gen2Command, RoundUpdate } from './gen2-types';

export class InventoryTracker {
	private currentRoundId: number = 0;
	private currentRoundCommands: number = 0;
	private hasAckInCurrentRound: boolean = false;

	/**
	 * Process a decoded command and assign it to an inventory round.
	 * Returns a RoundUpdate for the *previous* round if a new Query starts a new round.
	 *
	 * Mutates command.roundId to assign the current round.
	 */
	processCommand(command: Gen2Command): RoundUpdate | null {
		if (command.type === 'Query') {
			// Query starts a new round
			const previousRound =
				this.currentRoundId > 0
					? {
							roundId: this.currentRoundId,
							complete: this.hasAckInCurrentRound,
							commandCount: this.currentRoundCommands,
						}
					: null;

			this.currentRoundId++;
			this.currentRoundCommands = 1;
			this.hasAckInCurrentRound = false;
			command.roundId = this.currentRoundId;

			return previousRound;
		}

		// Non-Query commands belong to current round
		if (this.currentRoundId === 0) {
			// Commands before first Query -- assign round 0
			command.roundId = 0;
			return null;
		}

		this.currentRoundCommands++;
		command.roundId = this.currentRoundId;

		if (command.type === 'ACK') {
			this.hasAckInCurrentRound = true;
		}

		return null;
	}

	getCurrentRoundId(): number {
		return this.currentRoundId;
	}

	/**
	 * Get the status of the current (in-progress) round.
	 */
	getCurrentRoundStatus(): RoundUpdate {
		return {
			roundId: this.currentRoundId,
			complete: this.hasAckInCurrentRound,
			commandCount: this.currentRoundCommands,
		};
	}

	reset(): void {
		this.currentRoundId = 0;
		this.currentRoundCommands = 0;
		this.hasAckInCurrentRound = false;
	}
}
