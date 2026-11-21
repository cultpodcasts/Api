/**
 * The search index's table generations (SP-2.3, cultpodcasts/Api#226).
 *
 * The live index is `search_docs` + `doc_subjects` + `search_fts` (the names the migrations and the
 * query engine use). A rebuild loads a shadow generation (`_new`) while the live one keeps
 * serving, then swaps them in one transaction, parking the previous live generation as `_old`
 * until the RPP console's checks pass (`admin-rebuild.ts`).
 */

/** The three tables one generation of the index lives in. */
export type IndexTables = { docs: string; subjects: string; fts: string };

function generation(suffix: string): IndexTables {
	return { docs: `search_docs${suffix}`, subjects: `doc_subjects${suffix}`, fts: `search_fts${suffix}` };
}

/** The live index: what search reads and the migrations name. */
export const LIVE_TABLES: IndexTables = generation("");
/** A rebuild loads here while the live tables keep serving. */
export const SHADOW_TABLES: IndexTables = generation("_new");
/** The previous live generation after a swap, until the console's checks pass (then dropped) or fail (swapped back). */
export const PARKED_TABLES: IndexTables = generation("_old");

/** `search_meta` key holding the rebuild in progress (absent when there is none). */
export const REBUILD_META_KEY = "rebuild";

/**
 * - `loading`: the shadow tables exist with their triggers; pushes are written to both generations.
 * - `swapped`: the shadow is live and the previous generation is parked, with its own triggers; pushes are written
 *   to both, so a swap-back restores an index that missed nothing. Awaiting check, then finish or swap-back.
 * - `swappedBack`: a failed check put the previous generation back; the rejected one waits (no triggers) for abort.
 */
export type RebuildPhase = "loading" | "swapped" | "swappedBack";

export type RebuildState = {
	rebuildId: string;
	state: RebuildPhase;
	startedAt: string;
	swappedAt?: string;
};

const PHASES: readonly RebuildPhase[] = ["loading", "swapped", "swappedBack"];

/**
 * The `search_meta` rebuild row exists but is not a rebuild state. Fail safe: writes and rebuild
 * actions refuse rather than treat it as "no rebuild" (which would silently stop the dual-write).
 */
export class RebuildStateUnreadable extends Error {
	constructor(detail: string) {
		super(
			`search_meta '${REBUILD_META_KEY}' is unreadable (${detail}): fix or delete that row, and any ` +
				"_new / _old search tables, by hand"
		);
		this.name = "RebuildStateUnreadable";
	}
}

/**
 * The rebuild in progress, or null when there is none. Read on the primary (writes decide on it).
 * Throws {@link RebuildStateUnreadable} when the row exists but is not a valid state.
 */
export async function readRebuildState(db: D1Database): Promise<RebuildState | null> {
	const row = await db
		.prepare("SELECT value FROM search_meta WHERE key = ?")
		.bind(REBUILD_META_KEY)
		.first<{ value: string }>();
	if (!row) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(row.value);
	} catch {
		throw new RebuildStateUnreadable("not JSON");
	}
	const s = parsed as Partial<RebuildState> | null;
	if (!s || typeof s !== "object" || typeof s.rebuildId !== "string" || !s.rebuildId || !PHASES.includes(s.state as RebuildPhase)) {
		throw new RebuildStateUnreadable("no rebuildId or unknown state");
	}
	return s as RebuildState;
}

/** The generation every write to the live index must also reach, for a rebuild in this state. */
export function alsoWriteTo(state: RebuildState | null): IndexTables[] {
	if (state?.state === "loading") return [SHADOW_TABLES];
	if (state?.state === "swapped") return [PARKED_TABLES];
	return [];
}
