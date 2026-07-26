export const HERO_KV_KEY = "hero-episode-ids";
export const MAX_EPISODE_IDS = 50;
export const MAX_RAIL_SUBJECTS = 12;

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

export function mergePruneToAllowed(
	current: HeroCurationState,
	allowedEpisodeIds: string[],
	allowedRailSubjects?: string[]
): { state: HeroCurationState; pruned: boolean } {
	const episodeAllow = new Set(allowedEpisodeIds);
	const nextEpisodes = current.episodeIds.filter((id) => episodeAllow.has(id));

	let nextRails = current.railSubjects;
	if (allowedRailSubjects) {
		const railAllow = new Set(allowedRailSubjects);
		nextRails = current.railSubjects.filter((subject) => railAllow.has(subject));
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

