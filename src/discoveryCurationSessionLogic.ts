/** Global discovery curation room state (vote-set model). */

/** Roles the DO may trust on a WebSocket (from `X-User-Role` / socket tags). */
export const DISCOVERY_WS_ROLES = ["curate", "curate:supervised", "supervise"] as const;
export type DiscoveryWsRole = (typeof DISCOVERY_WS_ROLES)[number];

/**
 * Validate a trusted WS / DO role. Fail closed: missing or unknown → `null`
 * (do not default to `curate`, which elevates over `curate:supervised`).
 */
export function parseTrustedWsRole(
	header: string | null | undefined
): DiscoveryWsRole | null {
	if (
		header === "curate" ||
		header === "curate:supervised" ||
		header === "supervise"
	) {
		return header;
	}
	return null;
}

/**
 * Multi-tab presence: clear only when no other connected socket shares this userId.
 * `otherConnectedUserIds` must exclude the closing socket.
 */
export function shouldClearPresenceOnClose(
	closingUserId: string,
	otherConnectedUserIds: string[]
): boolean {
	return !otherConnectedUserIds.includes(closingUserId);
}

export type DiscoverySessionVote = {
	userId: string;
	/** Auth0 permission hint at vote time: `curate` | `curate:supervised` | `supervise` */
	role: string;
	at: string;
};

export type DiscoverySessionResultVotes = {
	votes: DiscoverySessionVote[];
	rev: number;
};

export type DiscoveryCurationSessionState = {
	/** Sticky reports this room is curating. */
	includedDocumentIds: string[];
	/** Open reports not yet included (client syncs from GET curation). */
	pendingDocumentIds: string[];
	/** resultId → vote set */
	votesByResultId: Record<string, DiscoverySessionResultVotes>;
	/** Presence: userId → lastSeen ISO */
	presence: Record<string, string>;
	rev: number;
	updatedAt: string;
};

export function emptyDiscoverySessionState(now = new Date()): DiscoveryCurationSessionState {
	return {
		includedDocumentIds: [],
		pendingDocumentIds: [],
		votesByResultId: {},
		presence: {},
		rev: 0,
		updatedAt: now.toISOString()
	};
}

/** Effective selection: any vote counts (Mode A — bot votes enable Save). */
export function selectedResultIds(state: DiscoveryCurationSessionState): string[] {
	return Object.entries(state.votesByResultId)
		.filter(([, v]) => v.votes.length > 0)
		.map(([id]) => id);
}

/** True when every vote is from a supervised curator (no curator/supervisor endorsement). */
export function isProvisional(votes: DiscoverySessionVote[]): boolean {
	return votes.length > 0 && votes.every((v) => v.role === "curate:supervised");
}

export function addVote(
	state: DiscoveryCurationSessionState,
	resultId: string,
	userId: string,
	role: string,
	now = new Date()
): DiscoveryCurationSessionState {
	const current = state.votesByResultId[resultId] ?? { votes: [], rev: 0 };
	const without = current.votes.filter((v) => v.userId !== userId);
	const votes = [...without, { userId, role, at: now.toISOString() }];
	return {
		...state,
		votesByResultId: {
			...state.votesByResultId,
			[resultId]: { votes, rev: current.rev + 1 }
		},
		rev: state.rev + 1,
		updatedAt: now.toISOString(),
		presence: { ...state.presence, [userId]: now.toISOString() }
	};
}

export function removeVote(
	state: DiscoveryCurationSessionState,
	resultId: string,
	userId: string,
	now = new Date()
): DiscoveryCurationSessionState {
	const current = state.votesByResultId[resultId];
	if (!current) {
		return {
			...state,
			presence: { ...state.presence, [userId]: now.toISOString() },
			updatedAt: now.toISOString()
		};
	}
	const votes = current.votes.filter((v) => v.userId !== userId);
	const votesByResultId = { ...state.votesByResultId };
	if (votes.length === 0) {
		delete votesByResultId[resultId];
	} else {
		votesByResultId[resultId] = { votes, rev: current.rev + 1 };
	}
	return {
		...state,
		votesByResultId,
		rev: state.rev + 1,
		updatedAt: now.toISOString(),
		presence: { ...state.presence, [userId]: now.toISOString() }
	};
}

/**
 * Apply a WS vote using the socket's trusted role only.
 * Client `role` in the message is ignored (privilege escalation guard).
 */
export function applyWsVoteIgnoringClientRole(
	state: DiscoveryCurationSessionState,
	userId: string,
	trustedRole: string,
	parsed: { resultId: string; selected?: boolean; role?: string },
	now = new Date()
): DiscoveryCurationSessionState {
	return parsed.selected
		? addVote(state, parsed.resultId, userId, trustedRole, now)
		: removeVote(state, parsed.resultId, userId, now);
}

/**
 * Client pushes the full open-document set from GET /discovery-curation.
 * New ids not in included become pending; included keeps sticky membership.
 */
export function syncOpenDocuments(
	state: DiscoveryCurationSessionState,
	openDocumentIds: string[],
	now = new Date()
): DiscoveryCurationSessionState {
	const open = [...new Set(openDocumentIds)];
	const included = new Set(state.includedDocumentIds);
	if (included.size === 0 && open.length > 0) {
		// First sync seeds the sticky set so an empty room does not trap everything as pending.
		return {
			...state,
			includedDocumentIds: open,
			pendingDocumentIds: [],
			rev: state.rev + 1,
			updatedAt: now.toISOString()
		};
	}
	const pending = open.filter((id) => !included.has(id));
	const includedStillOpen = state.includedDocumentIds.filter((id) => open.includes(id));
	return {
		...state,
		includedDocumentIds: includedStillOpen.length > 0 ? includedStillOpen : state.includedDocumentIds,
		pendingDocumentIds: pending,
		rev: state.rev + 1,
		updatedAt: now.toISOString()
	};
}

export function includePending(
	state: DiscoveryCurationSessionState,
	documentIds: string[] | "all",
	now = new Date()
): DiscoveryCurationSessionState {
	const toAdd =
		documentIds === "all"
			? state.pendingDocumentIds
			: documentIds.filter((id) => state.pendingDocumentIds.includes(id));
	if (toAdd.length === 0) {
		return state;
	}
	const included = [...new Set([...state.includedDocumentIds, ...toAdd])];
	const pending = state.pendingDocumentIds.filter((id) => !toAdd.includes(id));
	return {
		...state,
		includedDocumentIds: included,
		pendingDocumentIds: pending,
		rev: state.rev + 1,
		updatedAt: now.toISOString()
	};
}

/** After a successful Save: drop votes for submitted result ids; keep room docs. */
export function clearVotesForResults(
	state: DiscoveryCurationSessionState,
	resultIds: string[],
	now = new Date()
): DiscoveryCurationSessionState {
	const drop = new Set(resultIds);
	const votesByResultId = { ...state.votesByResultId };
	for (const id of drop) {
		delete votesByResultId[id];
	}
	return {
		...state,
		votesByResultId,
		rev: state.rev + 1,
		updatedAt: now.toISOString()
	};
}

export function touchPresence(
	state: DiscoveryCurationSessionState,
	userId: string,
	now = new Date()
): DiscoveryCurationSessionState {
	return {
		...state,
		presence: { ...state.presence, [userId]: now.toISOString() },
		updatedAt: now.toISOString()
	};
}

export type DiscoverySessionClientSnapshot = {
	includedDocumentIds: string[];
	pendingDocumentIds: string[];
	selectedResultIds: string[];
	votesByResultId: Record<
		string,
		{ votes: DiscoverySessionVote[]; rev: number; provisional: boolean }
	>;
	presence: Record<string, string>;
	rev: number;
	updatedAt: string;
};

export function toClientSnapshot(state: DiscoveryCurationSessionState): DiscoverySessionClientSnapshot {
	const votesByResultId: DiscoverySessionClientSnapshot["votesByResultId"] = {};
	for (const [id, entry] of Object.entries(state.votesByResultId)) {
		votesByResultId[id] = {
			votes: entry.votes,
			rev: entry.rev,
			provisional: isProvisional(entry.votes)
		};
	}
	return {
		includedDocumentIds: state.includedDocumentIds,
		pendingDocumentIds: state.pendingDocumentIds,
		selectedResultIds: selectedResultIds(state),
		votesByResultId,
		presence: state.presence,
		rev: state.rev,
		updatedAt: state.updatedAt
	};
}
