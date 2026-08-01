import { DurableObject } from "cloudflare:workers";
import { Env } from "./Env";
import {
	dedupeAndCap,
	dedupeAndCapRails,
	emptyHeroState,
	HERO_KV_KEY,
	HeroCurationReplaceInput,
	HeroCurationReplaceResult,
	HeroCurationState,
	MAX_EPISODE_IDS,
	mergeAppendEpisodes,
	mergePruneToAllowed,
	storedList
} from "./heroCurationLogic";

export {
	dedupeAndCap,
	dedupeAndCapRails,
	HERO_KV_KEY,
	MAX_EPISODE_IDS,
	MAX_RAIL_SUBJECTS,
	type HeroCurationState
} from "./heroCurationLogic";

const STORAGE_KEY = "state";

/**
 * Single global Durable Object owning the ordered hero list and rail subjects.
 * All mutations are serialized here so curator / indexer / cron cannot clobber order.
 */
export class HeroCurationDurableObject extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async get(): Promise<HeroCurationState> {
		return this.loadOrMigrate();
	}

	async replace(input: HeroCurationReplaceInput): Promise<HeroCurationReplaceResult> {
		const current = await this.loadOrMigrate();
		if (
			input.expectedUpdatedAt != null &&
			input.expectedUpdatedAt !== "" &&
			input.expectedUpdatedAt !== current.updatedAt
		) {
			return { ok: false, conflict: true, state: current };
		}

		const episodeIds = input.episodeIds
			? dedupeAndCap(input.episodeIds, MAX_EPISODE_IDS)
			: current.episodeIds;
		const railSubjects = input.railSubjects
			? dedupeAndCapRails(input.railSubjects)
			: current.railSubjects;

		const state: HeroCurationState = {
			episodeIds,
			railSubjects,
			updatedAt: new Date().toISOString()
		};
		await this.ctx.storage.put(STORAGE_KEY, state);
		return { ok: true, state };
	}

	async appendEpisodes(episodeIds: string[]): Promise<HeroCurationState> {
		const current = await this.loadOrMigrate();
		const next = mergeAppendEpisodes(current, episodeIds);
		if (!next) {
			console.log(
				`Hero auto-promote: DO append no-op (already present or empty). EpisodeIds: ${episodeIds.join(",")}. Total: ${current.episodeIds.length}.`
			);
			return current;
		}
		await this.ctx.storage.put(STORAGE_KEY, next);
		console.log(
			`Hero auto-promote: DO stored append. EpisodeIds: ${episodeIds.join(",")}. Total: ${next.episodeIds.length}. UpdatedAt: ${next.updatedAt}.`
		);
		return next;
	}

	async pruneToAllowedIds(
		allowedEpisodeIds: string[],
		allowedRailSubjects?: string[],
		dayCount?: number
	): Promise<{ state: HeroCurationState; pruned: boolean }> {
		const current = await this.loadOrMigrate();
		const result = mergePruneToAllowed(
			current,
			allowedEpisodeIds,
			allowedRailSubjects,
			dayCount
		);
		if (!result.pruned) {
			return result;
		}
		await this.ctx.storage.put(STORAGE_KEY, result.state);
		return result;
	}

	private async loadOrMigrate(): Promise<HeroCurationState> {
		const stored = await this.ctx.storage.get<HeroCurationState>(STORAGE_KEY);
		if (stored && Array.isArray(stored.episodeIds) && Array.isArray(stored.railSubjects)) {
			return {
				episodeIds: storedList(stored.episodeIds),
				railSubjects: storedList(stored.railSubjects),
				updatedAt: stored.updatedAt ?? new Date(0).toISOString()
			};
		}

		try {
			const fromKv = await this.env.Curated.get<Partial<HeroCurationState>>(HERO_KV_KEY, "json");
			if (fromKv) {
				const migrated: HeroCurationState = {
					episodeIds: dedupeAndCap(storedList(fromKv.episodeIds), MAX_EPISODE_IDS),
					railSubjects: dedupeAndCapRails(storedList(fromKv.railSubjects)),
					updatedAt: fromKv.updatedAt ?? new Date().toISOString()
				};
				await this.ctx.storage.put(STORAGE_KEY, migrated);
				return migrated;
			}
		} catch (error) {
			console.error("HeroCurationDurableObject: KV migrate failed", error);
		}

		const empty = emptyHeroState();
		await this.ctx.storage.put(STORAGE_KEY, empty);
		return empty;
	}
}

export function heroCurationStub(
	env: Env
): DurableObjectStub<HeroCurationDurableObject> {
	const id = env.HERO_CURATION_DURABLE_OBJECT.idFromName("global");
	return env.HERO_CURATION_DURABLE_OBJECT.get(id);
}

