import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../src/Env";

vi.mock("../src/HeroCurationDurableObject", () => ({
	heroCurationStub: (env: Env) =>
		env.HERO_CURATION_DURABLE_OBJECT.get(env.HERO_CURATION_DURABLE_OBJECT.idFromName("global"))
}));

import {
	appendHeroCurationEpisodes,
	deleteHeroCurationEpisodes,
	getHeroCuration,
	putHeroCuration
} from "../src/heroCuration";
import {
	dedupeAndCap,
	dedupeAndCapRails,
	MAX_EPISODE_IDS,
	MAX_RAIL_SUBJECTS,
	mergePruneToAllowed,
	mergeRemoveEpisodes
} from "../src/heroCurationLogic";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const episodeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const episodeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function heroDo(overrides: Record<string, unknown> = {}) {
	return {
		get: vi.fn(async () => ({
			episodeIds: [episodeA],
			railSubjects: ["day:0"],
			updatedAt: "2026-01-01T00:00:00.000Z"
		})),
		replace: vi.fn(),
		appendEpisodes: vi.fn(),
		removeEpisodes: vi.fn(),
		...overrides
	};
}

function envWithHero(stub: ReturnType<typeof heroDo>): Env {
	return testEnv({
		HERO_CURATION_DURABLE_OBJECT: {
			idFromName: () => ({}),
			get: () => stub
		} as unknown as DurableObjectNamespace
	});
}

describe("hero-curation", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("binds HeroCuration Durable Object and prunes on a 6-hour cron", () => {
		const wrangler = readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8");
		expect(wrangler).toContain("HeroCurationDurableObject");
		expect(wrangler).toContain("HERO_CURATION_DURABLE_OBJECT");
		expect(wrangler).toContain("0 */6 * * *");
	});

	it("GET returns DO state with Cache-Control max-age 60", async () => {
		const stub = heroDo();
		const app = new Hono<{ Bindings: Env }>();
		app.get("/hero-curation", (c) => getHeroCuration(c));

		const resp = await app.request("/hero-curation", { method: "GET" }, envWithHero(stub));
		expect(resp.status).toBe(200);
		expect(resp.headers.get("Cache-Control")).toBe("max-age=60");
		expect(await resp.json()).toEqual({
			episodeIds: [episodeA],
			railSubjects: ["day:0"],
			updatedAt: "2026-01-01T00:00:00.000Z"
		});
		expect(stub.get).toHaveBeenCalledOnce();
	});

	it("mutations return 401/403 and log safe JWT claims", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const unauth = appWithAuthPayload("/hero-curation", "put", putHeroCuration, null);
		const forbidden = appWithPermissions("/hero-curation", "put", putHeroCuration, ["submit"]);

		const r401 = await unauth.request(
			"/hero-curation",
			{ method: "PUT", headers: authJsonHeaders, body: JSON.stringify({ episodeIds: [episodeA] }) },
			testEnv()
		);
		const r403 = await forbidden.request(
			"/hero-curation",
			{ method: "PUT", headers: authJsonHeaders, body: JSON.stringify({ episodeIds: [episodeA] }) },
			testEnv()
		);

		expect(r401.status).toBe(401);
		expect(r403.status).toBe(403);
		expect(errorSpy.mock.calls.map((call) => call[0])).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ event: "hero_curation.unauthorised" }),
				expect.objectContaining({
					event: "hero_curation.forbidden",
					messages: expect.arrayContaining([expect.stringContaining("permissions=")]),
				})
			])
		);
		const forbiddenLog = errorSpy.mock.calls
			.map((call) => call[0] as { messages?: string[] })
			.find((payload) => payload.messages?.some((m) => m.includes("Hero curation authz 403")));
		expect(forbiddenLog?.messages?.join(" ")).toContain("scope=");
		expect(JSON.stringify(forbiddenLog)).not.toMatch(/Bearer |eyJ/);
	});

	it("accepts curate from OAuth scope (M2M)", async () => {
		const stub = heroDo({
			replace: vi.fn(async () => ({
				ok: true,
				state: { episodeIds: [episodeA], railSubjects: [], updatedAt: "2026-02-01T00:00:00.000Z" }
			}))
		});
		const app = appWithAuthPayload("/hero-curation", "put", putHeroCuration, {
			scope: "openid curate",
			azp: "m2m"
		} as never);

		const resp = await app.request(
			"/hero-curation",
			{ method: "PUT", headers: authJsonHeaders, body: JSON.stringify({ episodeIds: [episodeA] }) },
			envWithHero(stub)
		);
		expect(resp.status).toBe(200);
		expect(stub.replace).toHaveBeenCalledOnce();
	});

	it("PUT rejects an empty body and returns 409 on expectedUpdatedAt conflict", async () => {
		const stub = heroDo({
			replace: vi.fn(async () => ({
				ok: false,
				conflict: true,
				state: {
					episodeIds: [episodeA],
					railSubjects: ["day:0"],
					updatedAt: "2026-01-01T00:00:00.000Z"
				}
			}))
		});
		const app = appWithPermissions("/hero-curation", "put", putHeroCuration, ["curate"]);
		const env = envWithHero(stub);

		const empty = await app.request(
			"/hero-curation",
			{ method: "PUT", headers: authJsonHeaders, body: JSON.stringify({}) },
			env
		);
		expect(empty.status).toBe(400);

		const conflict = await app.request(
			"/hero-curation",
			{
				method: "PUT",
				headers: authJsonHeaders,
				body: JSON.stringify({
					episodeIds: [episodeB],
					expectedUpdatedAt: "2025-01-01T00:00:00.000Z"
				})
			},
			env
		);
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toMatchObject({ error: "Conflict", episodeIds: [episodeA] });
	});

	it("DELETE calls Durable Object removeEpisodes", async () => {
		const stub = heroDo({
			removeEpisodes: vi.fn(async () => ({
				episodeIds: [episodeA],
				railSubjects: ["day:0"],
				updatedAt: "2026-03-01T00:00:00.000Z"
			}))
		});
		const app = appWithPermissions(
			"/hero-curation/episodes",
			"delete",
			deleteHeroCurationEpisodes,
			["curate"]
		);

		const resp = await app.request(
			"/hero-curation/episodes",
			{ method: "DELETE", headers: authJsonHeaders, body: JSON.stringify({ episodeIds: [episodeB] }) },
			envWithHero(stub)
		);
		expect(resp.status).toBe(200);
		expect(stub.removeEpisodes).toHaveBeenCalledWith([episodeB]);
	});

	it("POST append calls Durable Object appendEpisodes", async () => {
		const stub = heroDo({
			appendEpisodes: vi.fn(async () => ({
				episodeIds: [episodeA, episodeB],
				railSubjects: ["day:0"],
				updatedAt: "2026-03-01T00:00:00.000Z"
			}))
		});
		const app = appWithPermissions(
			"/hero-curation/episodes",
			"post",
			appendHeroCurationEpisodes,
			["curate"]
		);

		const resp = await app.request(
			"/hero-curation/episodes",
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ episodeIds: [episodeB] }) },
			envWithHero(stub)
		);
		expect(resp.status).toBe(200);
		expect(stub.appendEpisodes).toHaveBeenCalledWith([episodeB]);
	});
});

describe("heroCurationLogic", () => {
	it("dedupes and caps episode IDs at 50 and rail subjects at 12", () => {
		expect(MAX_EPISODE_IDS).toBe(50);
		expect(MAX_RAIL_SUBJECTS).toBe(12);
		expect(dedupeAndCap(["a", "a", "b"], 50)).toEqual(["a", "b"]);
		expect(dedupeAndCap(Array.from({ length: 60 }, (_, i) => `id-${i}`), 50)).toHaveLength(50);
	});

	it("dedupes mixed day slots and subject rails without capping days as subjects", () => {
		expect(
			dedupeAndCapRails(["day:0", "Scientology", "day:0", "NXIVM", "day:1", "Scientology"])
		).toEqual(["day:0", "Scientology", "NXIVM", "day:1"]);
		const manySubjects = Array.from({ length: 20 }, (_, i) => `Subject ${i}`);
		const capped = dedupeAndCapRails(["day:0", ...manySubjects, "day:1"]);
		expect(capped.filter((entry) => entry.startsWith("day:"))).toEqual(["day:0", "day:1"]);
		expect(capped.filter((entry) => !entry.startsWith("day:")).length).toBe(12);
	});

	it("prunes stale subjects but keeps in-range day slots", () => {
		const { state, pruned } = mergePruneToAllowed(
			{
				episodeIds: [episodeA],
				railSubjects: ["day:0", "Gone", "Scientology", "day:2", "day:1"],
				updatedAt: "2026-01-01T00:00:00.000Z"
			},
			[episodeA],
			["Scientology"],
			2
		);
		expect(pruned).toBe(true);
		expect(state.railSubjects).toEqual(["day:0", "Scientology", "day:1"]);
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
});
