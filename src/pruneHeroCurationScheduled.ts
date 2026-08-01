import { Env } from "./Env";
import { heroCurationStub } from "./HeroCurationDurableObject";

type HomepagePayload = {
	recentEpisodes?: Array<{ id?: string; subjects?: string[]; release?: string }>;
};

/**
 * Every 6h: drop curated hero IDs (and pinned rails) that left the homepage week window.
 */
export async function pruneHeroCurationScheduled(env: Env): Promise<void> {
	let object: R2ObjectBody | null = null;
	try {
		object = await env.Content.get("homepage");
	} catch (error) {
		console.error("hero-prune: failed to read R2 homepage", error);
		return;
	}
	if (!object) {
		console.warn("hero-prune: homepage object missing; skip");
		return;
	}

	let homepage: HomepagePayload;
	try {
		homepage = await object.json<HomepagePayload>();
	} catch (error) {
		console.error("hero-prune: invalid homepage JSON", error);
		return;
	}

	const recent = Array.isArray(homepage.recentEpisodes) ? homepage.recentEpisodes : [];
	const allowedEpisodeIds = recent
		.map((ep) => ep.id)
		.filter((id): id is string => typeof id === "string" && id.length > 0);

	const allowedRailSubjects = new Set<string>();
	const releaseDays = new Set<string>();
	for (const ep of recent) {
		if (typeof ep.release === "string") {
			const day = ep.release.slice(0, 10);
			if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
				releaseDays.add(day);
			}
		}
		if (!Array.isArray(ep.subjects)) {
			continue;
		}
		for (const subject of ep.subjects) {
			if (typeof subject === "string" && subject.length > 0 && !subject.startsWith("_")) {
				allowedRailSubjects.add(subject);
			}
		}
	}

	try {
		const { state, pruned } = await heroCurationStub(env).pruneToAllowedIds(
			allowedEpisodeIds,
			[...allowedRailSubjects],
			releaseDays.size
		);
		if (pruned) {
			console.log(
				`hero-prune: pruned to ${state.episodeIds.length} episodes, ${state.railSubjects.length} rails (updatedAt=${state.updatedAt})`
			);
		} else {
			console.log("hero-prune: no changes");
		}
	} catch (error) {
		console.error("hero-prune: Durable Object prune failed", error);
	}
}
