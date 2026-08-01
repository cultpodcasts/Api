import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dedupeAndCap, dedupeAndCapRails, MAX_EPISODE_IDS, MAX_RAIL_SUBJECTS, mergePruneToAllowed, mergeRemoveEpisodes } from "../src/heroCurationLogic";

/**
 * Source-contract checks for /hero-curation (GET public, PUT/POST/DELETE curate + DO).
 */
describe("hero-curation contract", () => {
	const src = readFileSync(resolve(process.cwd(), "src/heroCuration.ts"), "utf8");
	const routes = readFileSync(resolve(process.cwd(), "src/openapiRoutes.ts"), "utf8");
	const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
	const wrangler = readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8");
	const logic = readFileSync(resolve(process.cwd(), "src/heroCurationLogic.ts"), "utf8");

	it("registers GET, PUT, POST append, and DELETE remove routes", () => {
		expect(index).toContain("openapi.get('/hero-curation', GetHeroCurationRoute)");
		expect(index).toContain("openapi.put('/hero-curation', PutHeroCurationRoute)");
		expect(index).toContain("openapi.post('/hero-curation/episodes', AppendHeroCurationEpisodesRoute)");
		expect(index).toContain("openapi.delete('/hero-curation/episodes', DeleteHeroCurationEpisodesRoute)");
	});

	it("GET is public; PUT, POST, and DELETE require Auth0 middleware", () => {
		const getBlock = routes.match(
			/export const GetHeroCurationRoute = createOpenApiRoute\(getHeroCuration, \{[\s\S]*?\n\}\);/
		)?.[0];
		const putBlock = routes.match(
			/export const PutHeroCurationRoute = createOpenApiRoute\(putHeroCuration, \{[\s\S]*?\n\}\);/
		)?.[0];
		const appendBlock = routes.match(
			/export const AppendHeroCurationEpisodesRoute = createOpenApiRoute\(appendHeroCurationEpisodes, \{[\s\S]*?\n\}\);/
		)?.[0];
		const deleteBlock = routes.match(
			/export const DeleteHeroCurationEpisodesRoute = createOpenApiRoute\(deleteHeroCurationEpisodes, \{[\s\S]*?\n\}\);/
		)?.[0];
		expect(getBlock).toBeDefined();
		expect(putBlock).toBeDefined();
		expect(appendBlock).toBeDefined();
		expect(deleteBlock).toBeDefined();
		expect(getBlock).not.toContain("auth: true");
		expect(putBlock).toContain("auth: true");
		expect(appendBlock).toContain("auth: true");
		expect(deleteBlock).toContain("auth: true");
	});

	it("mutations enforce curate permission with 401/403", () => {
		expect(src).toContain('hasPermission(auth0Payload, "curate")');
		expect(src).toContain("401");
		expect(src).toContain("403");
		expect(src).toContain("400");
	});

	it("logs safe JWT claims on requireCurate 401/403", () => {
		expect(src).toContain("formatCurateAuthzClaims");
		expect(src).toContain("Hero curation authz 401");
		expect(src).toContain("Hero curation authz 403");
		const helper = readFileSync(resolve(process.cwd(), "src/jwtAuthzLog.ts"), "utf8");
		expect(helper).toContain("permissions=");
		expect(helper).toContain("scope=");
		expect(helper).not.toContain("authorization.slice");
		expect(helper).not.toContain("c.req.header");
	});

	it("accepts curate from permissions or OAuth scope (M2M)", () => {
		const helper = readFileSync(resolve(process.cwd(), "src/hasPermission.ts"), "utf8");
		expect(helper).toContain("permissions?.includes");
		expect(helper).toContain("scope.split");
	});

	it("uses HeroCuration Durable Object and GET cache max-age 60", () => {
		expect(src).toContain("heroCurationStub");
		expect(src).toContain("cacheControlMaxAge: 60");
		expect(src).toContain("updatedAt");
		expect(wrangler).toContain("HeroCurationDurableObject");
		expect(wrangler).toContain("HERO_CURATION_DURABLE_OBJECT");
	});

	it("schedules prune every 6 hours", () => {
		expect(wrangler).toContain("0 */6 * * *");
		expect(index).toContain("pruneHeroCurationScheduled");
		expect(index).toContain("scheduled");
	});

	it("dedupes and caps episode IDs at 50 and rail subjects at 12", () => {
		expect(MAX_EPISODE_IDS).toBe(50);
		expect(MAX_RAIL_SUBJECTS).toBe(12);
		expect(dedupeAndCap(["a", "a", "b"], 50)).toEqual(["a", "b"]);
		expect(dedupeAndCap(Array.from({ length: 60 }, (_, i) => `id-${i}`), 50)).toHaveLength(50);
	});

	it("dedupes mixed day slots and subject rails without capping days as subjects", () => {
		expect(logic).toContain("dedupeAndCapRails");
		expect(dedupeAndCapRails([
			"day:0",
			"Scientology",
			"day:0",
			"NXIVM",
			"day:1",
			"Scientology"
		])).toEqual(["day:0", "Scientology", "NXIVM", "day:1"]);
		const manySubjects = Array.from({ length: 20 }, (_, i) => `Subject ${i}`);
		const capped = dedupeAndCapRails(["day:0", ...manySubjects, "day:1"]);
		expect(capped.filter((entry) => entry.startsWith("day:"))).toEqual(["day:0", "day:1"]);
		expect(capped.filter((entry) => !entry.startsWith("day:")).length).toBe(12);
	});

	it("prunes stale subjects but keeps in-range day slots", () => {
		const { state, pruned } = mergePruneToAllowed(
			{
				episodeIds: ["11111111-1111-1111-1111-111111111111"],
				railSubjects: ["day:0", "Gone", "Scientology", "day:2", "day:1"],
				updatedAt: "2026-01-01T00:00:00.000Z"
			},
			["11111111-1111-1111-1111-111111111111"],
			["Scientology"],
			2
		);
		expect(pruned).toBe(true);
		expect(state.railSubjects).toEqual(["day:0", "Scientology", "day:1"]);
	});

	it("supports expectedUpdatedAt conflict responses", () => {
		expect(src).toContain("expectedUpdatedAt");
		expect(src).toContain("409");
	});

	it("rejects a PUT carrying neither episodeIds nor railSubjects", () => {
		expect(src).toContain("!parsed.data.episodeIds && !parsed.data.railSubjects");
	});

	it("mergeRemoveEpisodes drops matching IDs and is a no-op when none match", () => {
		const current = {
			episodeIds: ["a", "b", "c"],
			railSubjects: ["day:0"],
			updatedAt: "2026-01-01T00:00:00.000Z"
		};
		const removed = mergeRemoveEpisodes(current, ["b", "missing"]);
		expect(removed?.episodeIds).toEqual(["a", "c"]);
		expect(removed?.railSubjects).toEqual(["day:0"]);
		expect(mergeRemoveEpisodes(current, ["missing"])).toBeNull();
		expect(mergeRemoveEpisodes(current, [])).toBeNull();
	});

	it("DELETE remove handler calls Durable Object removeEpisodes", () => {
		expect(src).toContain("deleteHeroCurationEpisodes");
		expect(src).toContain("removeEpisodes");
		expect(logic).toContain("mergeRemoveEpisodes");
	});
});

