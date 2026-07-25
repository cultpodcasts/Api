import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-contract checks for /hero-curation (GET public, PUT curate + KV).
 */
describe("hero-curation contract", () => {
	const src = readFileSync(resolve(process.cwd(), "src/heroCuration.ts"), "utf8");
	const routes = readFileSync(resolve(process.cwd(), "src/openapiRoutes.ts"), "utf8");
	const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");

	it("registers GET and PUT /hero-curation", () => {
		expect(index).toContain("openapi.get('/hero-curation', GetHeroCurationRoute)");
		expect(index).toContain("openapi.put('/hero-curation', PutHeroCurationRoute)");
	});

	it("GET is public; PUT requires Auth0 middleware", () => {
		const getBlock = routes.match(
			/export const GetHeroCurationRoute = createOpenApiRoute\(getHeroCuration, \{[\s\S]*?\n\}\);/
		)?.[0];
		const putBlock = routes.match(
			/export const PutHeroCurationRoute = createOpenApiRoute\(putHeroCuration, \{[\s\S]*?\n\}\);/
		)?.[0];
		expect(getBlock).toBeDefined();
		expect(putBlock).toBeDefined();
		expect(getBlock).not.toContain("auth: true");
		expect(putBlock).toContain("auth: true");
	});

	it("PUT enforces curate permission with 401/403", () => {
		expect(src).toContain("permissions?.includes(\"curate\")");
		expect(src).toContain("401");
		expect(src).toContain("403");
		expect(src).toContain("400");
	});

	it("uses Curated KV key hero-episode-ids and GET cache max-age 60", () => {
		expect(src).toContain("hero-episode-ids");
		expect(src).toContain("Curated");
		expect(src).toContain("cacheControlMaxAge: 60");
		expect(src).toContain('episodeIds: []');
		expect(src).toContain("updatedAt: null");
	});

	it("dedupes and caps episode IDs at 50", () => {
		expect(src).toContain("MAX_EPISODE_IDS = 50");
		expect(src).toContain("dedupeAndCap");
	});
});
