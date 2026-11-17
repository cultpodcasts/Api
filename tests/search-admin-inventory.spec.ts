import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import searchWorker from "../workers/search/src/index";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";
import { SEARCH_ADMIN_INVENTORY_URL, searchAdminInventory } from "../src/searchAdminDocs";
import type { SearchEnv } from "../workers/search/src/env";
import { DEFAULT_INVENTORY_LIMIT } from "../workers/search/src/admin-inventory";
import { appWithAuthPayload, testEnv } from "./honoTestApp";
import { d1, d1Spy, migratedSearchDb } from "./support/searchD1";

/** SP-2.2 (RPP #1322): the D1 search index's id inventory for the weekly reconcile. */

const T0 = Date.UTC(2026, 10, 1);
const M2M_WRITER = { gty: "client_credentials", sub: "abc@clients", scope: "write:search-index" } as unknown as Auth0JwtPayload;

function upsert(id: string, modifiedAt: number) {
	return { id, title: `Title ${id}`, release: "2026-11-01T10:00:00Z", duration: "00:10:00", modifiedAt };
}

async function seeded(ids: string[]): Promise<{ db: DatabaseSync; env: SearchEnv }> {
	const db = migratedSearchDb();
	const env: SearchEnv = { SEARCH_DB: d1(db), searchEnvironment: "preview" };
	const resp = await searchWorker.fetch(
		new Request("https://search.internal/admin/docs", {
			method: "POST",
			body: JSON.stringify({ upserts: ids.map((id, i) => upsert(id, T0 + i)) })
		}),
		env
	);
	expect(resp.status).toBe(200);
	return { db, env };
}

async function page(env: SearchEnv, query = "", method = "GET") {
	const resp = await searchWorker.fetch(new Request(`https://search.internal/admin/docs/inventory${query}`, { method }), env);
	return { status: resp.status, body: (await resp.json()) as any };
}

describe("search Worker GET /admin/docs/inventory (SP-2.2)", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	it("pages every id with its stored modifiedAt, ordered by id, until next is null", async () => {
		const { env } = await seeded(["c", "a", "e", "b", "d"]);
		const first = await page(env, "?limit=2");
		expect(first).toEqual({
			status: 200,
			body: { items: [{ id: "a", modifiedAt: T0 + 1 }, { id: "b", modifiedAt: T0 + 3 }], next: "b" }
		});
		const second = await page(env, "?limit=2&after=b");
		expect(second.body).toEqual({ items: [{ id: "c", modifiedAt: T0 }, { id: "d", modifiedAt: T0 + 4 }], next: "d" });
		const last = await page(env, "?limit=2&after=d");
		expect(last.body).toEqual({ items: [{ id: "e", modifiedAt: T0 + 2 }], next: null });
	});

	it("returns a full last page with next null (no empty extra page) and an empty index as one empty page", async () => {
		const { env } = await seeded(["a", "b"]);
		expect((await page(env, "?limit=2")).body).toEqual({
			items: [{ id: "a", modifiedAt: T0 }, { id: "b", modifiedAt: T0 + 1 }],
			next: null
		});
		const empty = migratedSearchDb();
		expect((await page({ SEARCH_DB: d1(empty), searchEnvironment: "preview" })).body).toEqual({ items: [], next: null });
	});

	it("defaults the page size and reads on the primary, not a replica session", async () => {
		const spy = d1Spy();
		const db = migratedSearchDb();
		const resp = await page({ SEARCH_DB: d1(db, { spy }), searchEnvironment: "preview" });
		expect(resp.status).toBe(200);
		expect(spy.sessions).toEqual([]);
		expect(spy.directPrepares.join(" ")).toMatch(/FROM search_docs WHERE id > \?1 ORDER BY id LIMIT \?2/);
		expect(DEFAULT_INVENTORY_LIMIT).toBe(5000);
	});

	it.each(["0", "10001", "-1", "abc", "1.5"])("refuses limit=%s with a 400 that names limit", async (limit) => {
		const { env } = await seeded(["a"]);
		const resp = await page(env, `?limit=${limit}`);
		expect(resp.status).toBe(400);
		expect(resp.body.error.message).toMatch(/limit/);
	});

	it("is GET only", async () => {
		const { env } = await seeded(["a"]);
		expect((await page(env, "", "POST")).status).toBe(405);
	});

	it("is 503 with the fixed body when D1 fails", async () => {
		const broken = migratedSearchDb();
		broken.exec("DROP TABLE search_fts; DROP TABLE doc_subjects; DROP TABLE search_docs;");
		const resp = await page({ SEARCH_DB: d1(broken), searchEnvironment: "preview" });
		expect(resp.status).toBe(503);
		expect(resp.body.error.code).toBe("ServiceUnavailable");
	});
});

describe("api Worker GET /search/admin/docs/inventory (SP-2.2)", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "info").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	function get(payload: Auth0JwtPayload | null, SEARCH?: Fetcher, query = "") {
		const app = appWithAuthPayload("/search/admin/docs/inventory", "get", searchAdminInventory, payload);
		return app.request(`/search/admin/docs/inventory${query}`, { method: "GET" }, testEnv({ SEARCH }));
	}

	function binding(respond: (req: Request) => Promise<Response> | Response) {
		const calls: { url: string; method: string }[] = [];
		const fetcher = {
			fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const req = new Request(input, init);
				calls.push({ url: req.url, method: req.method });
				return respond(req);
			})
		} as unknown as Fetcher;
		return { fetcher, calls };
	}

	it("forwards after and limit (and nothing else) to the search Worker and returns its page uncached", async () => {
		const pageBody = { items: [{ id: "b", modifiedAt: 1 }], next: null };
		const { fetcher, calls } = binding(() => Response.json(pageBody));
		const resp = await get(M2M_WRITER, fetcher, "?after=a&limit=10&other=x");
		expect(resp.status).toBe(200);
		expect(resp.headers.get("cache-control")).toBe("no-store");
		expect(await resp.json()).toEqual(pageBody);
		expect(calls).toEqual([{ url: `${SEARCH_ADMIN_INVENTORY_URL}?after=a&limit=10`, method: "GET" }]);
	});

	it("pages through D1 end to end (search Worker behind the binding)", async () => {
		const { env } = await seeded(["x", "y"]);
		const { fetcher } = binding((req) => searchWorker.fetch(req, env));
		const resp = await get(M2M_WRITER, fetcher, "?limit=1");
		expect(await resp.json()).toEqual({ items: [{ id: "x", modifiedAt: T0 }], next: "x" });
	});

	it.each([
		["no token", null, 401],
		["an M2M token without write:search-index", { gty: "client_credentials", sub: "abc@clients", scope: "submit" }, 403],
		["a person's token with write:search-index", { sub: "auth0|person", permissions: ["write:search-index"] }, 403]
	] as const)("refuses %s without calling the search Worker", async (_name, payload, status) => {
		const { fetcher, calls } = binding(() => Response.json({}));
		const resp = await get(payload as unknown as Auth0JwtPayload | null, fetcher);
		expect(resp.status).toBe(status);
		expect(calls).toEqual([]);
	});

	it("passes a 400 through, and is 503 without a binding and 502 when the binding throws", async () => {
		const bad = { error: { code: "", message: "limit must be an integer from 1 to 10000" } };
		const resp400 = await get(M2M_WRITER, binding(() => Response.json(bad, { status: 400 })).fetcher, "?limit=0");
		expect(resp400.status).toBe(400);
		expect(await resp400.json()).toEqual(bad);
		expect((await get(M2M_WRITER, undefined)).status).toBe(503);
		const { fetcher } = binding(() => {
			throw new Error("binding down");
		});
		expect((await get(M2M_WRITER, fetcher)).status).toBe(502);
	});
});
