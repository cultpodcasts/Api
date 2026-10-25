import { describe, expect, it } from "vitest";
import {
	addVote,
	clearVotesForResults,
	emptyDiscoverySessionState,
	includePending,
	isProvisional,
	removeVote,
	selectedResultIds,
	syncOpenDocuments,
	toClientSnapshot
} from "../src/discoveryCurationSessionLogic";

describe("discoveryCurationSessionLogic", () => {
	it("treats any vote as selected (Mode A)", () => {
		let state = emptyDiscoverySessionState();
		state = addVote(state, "r1", "alice", "curate:supervised");
		expect(selectedResultIds(state)).toEqual(["r1"]);
		expect(isProvisional(state.votesByResultId["r1"].votes)).toBe(true);
	});

	it("deselect removes only that user's vote", () => {
		let state = emptyDiscoverySessionState();
		state = addVote(state, "r1", "alice", "curate");
		state = addVote(state, "r1", "bob", "curate");
		state = removeVote(state, "r1", "alice");
		expect(state.votesByResultId["r1"].votes.map((v) => v.userId)).toEqual(["bob"]);
		expect(isProvisional(state.votesByResultId["r1"].votes)).toBe(false);
	});

	it("first syncOpenDocuments seeds included set", () => {
		let state = emptyDiscoverySessionState();
		state = syncOpenDocuments(state, ["d1", "d2"]);
		expect(state.includedDocumentIds).toEqual(["d1", "d2"]);
		expect(state.pendingDocumentIds).toEqual([]);
	});

	it("later open docs become pending until include", () => {
		let state = emptyDiscoverySessionState();
		state = syncOpenDocuments(state, ["d1"]);
		state = syncOpenDocuments(state, ["d1", "d2"]);
		expect(state.pendingDocumentIds).toEqual(["d2"]);
		state = includePending(state, "all");
		expect(state.includedDocumentIds).toEqual(["d1", "d2"]);
		expect(state.pendingDocumentIds).toEqual([]);
	});

	it("clearVotesForResults drops submitted selections", () => {
		let state = emptyDiscoverySessionState();
		state = addVote(state, "r1", "alice", "curate");
		state = addVote(state, "r2", "alice", "curate");
		state = clearVotesForResults(state, ["r1"]);
		expect(selectedResultIds(state)).toEqual(["r2"]);
		expect(toClientSnapshot(state).selectedResultIds).toEqual(["r2"]);
	});
});
