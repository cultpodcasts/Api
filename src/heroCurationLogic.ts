export const HERO_KV_KEY = "hero-episode-ids";
export const MAX_EPISODE_IDS = 50;
export const MAX_RAIL_SUBJECTS = 12;
/** Relative day slots day:0 … day:N (homepage week is ~7 days; allow a little headroom). */
export const MAX_DAY_RAIL_OFFSET = 13;

const DAY_RAIL_RE = /^day:(\d+)$/;

export type HeroCurationState = {
	episodeIds: string[];
	railSubjects: string[];
	updatedAt: string;
};

export type HeroCurationReplaceInput = {
	episodeIds?: string[];
	railSubjects?: string[];
	expectedUpdatedAt?: string | null;
};

export type HeroCurationReplaceResult =
	| { ok: true; state: HeroCurationState }
	| { ok: false; conflict: true; state: HeroCurationState };

export function storedList(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function dedupeAndCap(values: string[], max: number): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		if (seen.has(value)) {
			continue;
		}
		seen.add(value);
		result.push(value);
		if (result.length >= max) {
			break;
		}
	}
	return result;
}

export function parseDayRailOffset(entry: string): number | null {
	const match = DAY_RAIL_RE.exec(entry);
	if (!match) {
		return null;
	}
	return Number.parseInt(match[1], 10);
}

export function isDayRailEntry(entry: string): boolean {
	return parseDayRailOffset(entry) !== null;
}

/**
 * Dedupe a mixed rail order (relative day slots + subject names).
 * Subjects are capped at {@link MAX_RAIL_SUBJECTS}; day offsets must be ≤ {@link MAX_DAY_RAIL_OFFSET}.
 */
export function dedupeAndCapRails(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	let subjectCount = 0;

	for (const raw of values) {
		const value = raw.trim();
		if (value.length === 0 || seen.has(value)) {
			continue;
		}
		const offset = parseDayRailOffset(value);
		if (offset !== null) {
			if (offset > MAX_DAY_RAIL_OFFSET) {
				continue;
			}
			seen.add(value);
			result.push(`day:${offset}`);
			continue;
		}
		if (subjectCount >= MAX_RAIL_SUBJECTS) {
			continue;
		}
		seen.add(value);
		result.push(value);
		subjectCount += 1;
	}

	return result;
}

export function emptyHeroState(): HeroCurationState {
	return {
		episodeIds: [],
		railSubjects: [],
		updatedAt: new Date(0).toISOString()
	};
}

export function mergeAppendEpisodes(
	current: HeroCurationState,
	episodeIds: string[]
): HeroCurationState | null {
	const incoming = dedupeAndCap(episodeIds, MAX_EPISODE_IDS);
	if (incoming.length === 0) {
		return null;
	}
	const existing = new Set(current.episodeIds);
	const toPrepend = incoming.filter((id) => !existing.has(id));
	if (toPrepend.length === 0) {
		return null;
	}
	return {
		episodeIds: dedupeAndCap([...toPrepend, ...current.episodeIds], MAX_EPISODE_IDS),
		railSubjects: current.railSubjects,
		updatedAt: new Date().toISOString()
	};
}

/**
 * Remove episode IDs from the hero list. Idempotent — missing IDs are ignored.
 * Returns null when nothing changes (no CAS required).
 */
export function mergeRemoveEpisodes(
	current: HeroCurationState,
	episodeIds: string[]
): HeroCurationState | null {
	const toRemove = new Set(episodeIds.filter((id) => typeof id === "string" && id.length > 0));
	if (toRemove.size === 0) {
		return null;
	}
	const nextEpisodes = current.episodeIds.filter((id) => !toRemove.has(id));
	if (nextEpisodes.length === current.episodeIds.length) {
		return null;
	}
	return {
		episodeIds: nextEpisodes,
		railSubjects: current.railSubjects,
		updatedAt: new Date().toISOString()
	};
}

export function mergePruneToAllowed(
	current: HeroCurationState,
	allowedEpisodeIds: string[],
	allowedRailSubjects?: string[],
	dayCount?: number
): { state: HeroCurationState; pruned: boolean } {
	const episodeAllow = new Set(allowedEpisodeIds);
	const nextEpisodes = current.episodeIds.filter((id) => episodeAllow.has(id));

	let nextRails = current.railSubjects;
	if (allowedRailSubjects) {
		const railAllow = new Set(allowedRailSubjects);
		const maxDay = dayCount ?? MAX_DAY_RAIL_OFFSET + 1;
		nextRails = current.railSubjects.filter((entry) => {
			const offset = parseDayRailOffset(entry);
			if (offset !== null) {
				return offset < maxDay;
			}
			return railAllow.has(entry);
		});
	}

	const pruned =
		nextEpisodes.length !== current.episodeIds.length ||
		nextEpisodes.some((id, i) => id !== current.episodeIds[i]) ||
		nextRails.length !== current.railSubjects.length ||
		nextRails.some((subject, i) => subject !== current.railSubjects[i]);

	if (!pruned) {
		return { state: current, pruned: false };
	}

	return {
		state: {
			episodeIds: nextEpisodes,
			railSubjects: nextRails,
			updatedAt: new Date().toISOString()
		},
		pruned: true
	};
}
