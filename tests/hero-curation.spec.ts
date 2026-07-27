import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dedupeAndCap, MAX_EPISODE_IDS, MAX_RAIL_SUBJECTS } from "../src/heroCurationLogic";

/**
 * Source-contract checks for /hero-curation (GET public, PUT/POST curate + DO).
 */
describe("hero-curation contract", () => {
	const src = readFileSync(resolve(process.cwd(), "src/heroCuration.ts"), "utf8");
	const routes = readFileSync(resolve(process.cwd(), "src/openapiRoutes.ts"), "utf8");
	const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
	const wrangler = readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8");

	it("registers GET, PUT, and POST append routes", () => {
		expect(index).toContain("openapi.get('/hero-curation', GetHeroCurationRoute)");
		expect(index).toContain("openapi.put('/hero-curation', PutHeroCurationRoute)");
		expect(index).toContain("openapi.post('/hero-curation/episodes', AppendHeroCurationEpisodesRoute)");
	});

	it("GET is public; PUT and POST require Auth0 middleware", () => {
		const getBlock = routes.match(
			/export const GetHeroCurationRoute = createOpenApiRoute\(getHeroCuration, \{[\s\S]*?\n\}\);/
		)?.[0];
		const putBlock = routes.match(
			/export const PutHeroCurationRoute = createOpenApiRoute\(putHeroCuration, \{[\s\S]*?\n\}\);/
		)?.[0];
		const appendBlock = routes.match(
			/export const AppendHeroCurationEpisodesRoute = createOpenApiRoute\(appendHeroCurationEpisodes, \{[\s\S]*?\n\}\);/
		)?.[0];
		expect(getBlock).toBeDefined();
		expect(putBlock).toBeDefined();
		expect(appendBlock).toBeDefined();
		expect(getBlock).not.toContain("auth: true");
		expect(putBlock).toContain("auth: true");
		expect(appendBlock).toContain("auth: true");
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

	it("supports expectedUpdatedAt conflict responses", () => {
		expect(src).toContain("expectedUpdatedAt");
		expect(src).toContain("409");
	});

	it("rejects a PUT carrying neither episodeIds nor railSubjects", () => {
		expect(src).toContain("!parsed.data.episodeIds && !parsed.data.railSubjects");
	});
});

