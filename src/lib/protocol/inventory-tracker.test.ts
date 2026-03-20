import { describe, it, expect, beforeEach } from 'vitest';
import { InventoryTracker } from './inventory-tracker';
import type { Gen2Command } from './gen2-types';

/** Helper to create a minimal Gen2Command for testing. */
function makeCmd(type: Gen2Command['type'], overrides?: Partial<Gen2Command>): Gen2Command {
	return {
		type,
		rawBits: [],
		sampleOffset: 0,
		timestamp: 0,
		crcValid: null,
		params: {},
		roundId: 0,
		...overrides,
	};
}

describe('InventoryTracker', () => {
	let tracker: InventoryTracker;

	beforeEach(() => {
		tracker = new InventoryTracker();
	});

	it('starts with round 0', () => {
		expect(tracker.getCurrentRoundId()).toBe(0);
	});

	it('Query starts round 1', () => {
		const cmd = makeCmd('Query');
		const result = tracker.processCommand(cmd);

		expect(cmd.roundId).toBe(1);
		expect(tracker.getCurrentRoundId()).toBe(1);
		// First Query returns null (no previous round to report)
		expect(result).toBeNull();
	});

	it('ACK within round increments command count', () => {
		const query = makeCmd('Query');
		tracker.processCommand(query);

		const ack = makeCmd('ACK');
		const result = tracker.processCommand(ack);

		expect(ack.roundId).toBe(1);
		expect(result).toBeNull();

		const status = tracker.getCurrentRoundStatus();
		expect(status.commandCount).toBe(2);
		expect(status.complete).toBe(true);
	});

	it('ACK marks round as complete', () => {
		const query = makeCmd('Query');
		tracker.processCommand(query);

		const ack = makeCmd('ACK');
		tracker.processCommand(ack);

		const status = tracker.getCurrentRoundStatus();
		expect(status.complete).toBe(true);
	});

	it('second Query starts round 2 and returns round 1 status', () => {
		const query1 = makeCmd('Query');
		tracker.processCommand(query1);

		const ack = makeCmd('ACK');
		tracker.processCommand(ack);

		const query2 = makeCmd('Query');
		const round1Status = tracker.processCommand(query2);

		expect(round1Status).not.toBeNull();
		expect(round1Status!.roundId).toBe(1);
		expect(round1Status!.complete).toBe(true);
		expect(round1Status!.commandCount).toBe(2);

		expect(query2.roundId).toBe(2);
		expect(tracker.getCurrentRoundId()).toBe(2);
	});

	it('round without ACK is incomplete', () => {
		const query1 = makeCmd('Query');
		tracker.processCommand(query1);

		// No ACK, directly next Query
		const query2 = makeCmd('Query');
		const round1Status = tracker.processCommand(query2);

		expect(round1Status).not.toBeNull();
		expect(round1Status!.roundId).toBe(1);
		expect(round1Status!.complete).toBe(false);
		expect(round1Status!.commandCount).toBe(1);
	});

	it('reset() returns to round 0', () => {
		const query = makeCmd('Query');
		tracker.processCommand(query);
		expect(tracker.getCurrentRoundId()).toBe(1);

		tracker.reset();
		expect(tracker.getCurrentRoundId()).toBe(0);

		const status = tracker.getCurrentRoundStatus();
		expect(status.roundId).toBe(0);
		expect(status.commandCount).toBe(0);
		expect(status.complete).toBe(false);
	});

	it('commands before first Query get roundId 0', () => {
		const ack = makeCmd('ACK');
		const result = tracker.processCommand(ack);

		expect(ack.roundId).toBe(0);
		expect(result).toBeNull();
	});

	it('QueryRep within round increments count', () => {
		const query = makeCmd('Query');
		tracker.processCommand(query);

		const qrep = makeCmd('QueryRep');
		tracker.processCommand(qrep);

		expect(qrep.roundId).toBe(1);
		const status = tracker.getCurrentRoundStatus();
		expect(status.commandCount).toBe(2);
	});

	it('Query->QueryRep->ACK->Query sequence produces correct round boundaries', () => {
		const query1 = makeCmd('Query');
		tracker.processCommand(query1);
		expect(query1.roundId).toBe(1);

		const qrep = makeCmd('QueryRep');
		tracker.processCommand(qrep);
		expect(qrep.roundId).toBe(1);

		const ack = makeCmd('ACK');
		tracker.processCommand(ack);
		expect(ack.roundId).toBe(1);

		const query2 = makeCmd('Query');
		const round1 = tracker.processCommand(query2);

		expect(round1).not.toBeNull();
		expect(round1!.roundId).toBe(1);
		expect(round1!.complete).toBe(true);
		expect(round1!.commandCount).toBe(3); // Query + QueryRep + ACK
		expect(query2.roundId).toBe(2);
	});
});
