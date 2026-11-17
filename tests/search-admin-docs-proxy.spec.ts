import { fromHono } from "chanfana";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import searchWorker from "../workers/search/src/index";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";
import type { Env } from "../src/Env";
import { createOpenApiRoute, searchIndexWriteAuth } from "../src/openapiRouteFactory";
import { SEARCH_ADMIN_DOCS_URL, searchAdminDocs } from "../src/searchAdminDocs";
import { appWithAuthPayload, authJsonHeaders, testEnv } from "./honoTestApp";
import { d1, migratedSearchDb } from "./support/searchD1";

/** SP-1.4 (cultpodcasts/Api#222): api Worker `POST /search/admin/docs` → search Worker over the SEARCH binding. */

const M2M_WRITER = { gty: "client_credentials", sub: "abc@clients", scope: "write:search-index" } as unknown as Auth0JwtPayload;
const body = {
	upserts: [{ id: "ep-1", title: "Xenu", release: "2026-11-01T10:00:00Z", duration: "00:10:00", modifiedAt: 1 }]
};

function post(payload: Auth0JwtPayload | null, SEARCH?: Fetcher) {
	const app = appWithAuthPayload("/search/admin/docs", "post", searchAdminDocs, payload);
	return app.request("/search/admin/docs", { method: "POST", headers: authJsonHeaders, body: JSON.stringify(body) }, testEnv({ SEARCH }));
}

function binding(respond: (req: Request) => Promise<Response> | Response) {
	const calls: { url: string; method: string; body: string }[] = [];
	const fetcher = {
		fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const req = new Request(input, init);
			calls.push({ url: req.url, method: req.method, body: await req.clone().text() });
			return respond(req);
		})
	} as unknown as Fetcher;
	return { fetcher, calls };
}

describe("api Worker POST /search/admin/docs (SP-1.4)", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "info").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	it("forwards an M2M write:search-index request to the search Worker and returns its outcome", async () => {
		const outcome = { upserted: 1, deleted: 0, stale: [], notFound: [] };
		const { fetcher, calls } = binding(() => Response.json(outcome));
		const resp = await post(M2M_WRITER, fetcher);
		expect(resp.status).toBe(200);
		expect(resp.headers.get("cache-control")).toBe("no-store");
		expect(await resp.json()).toEqual(outcome);
		expect(calls).toEqual([{ url: SEARCH_ADMIN_DOCS_URL, method: "POST", body: JSON.stringify(body) }]);
	});

	it("accepts write:search-index from the RBAC permissions claim as well as scope", async () => {
		const { fetcher, calls } = binding(() => Response.json({ upserted: 1, deleted: 0, stale: [], notFound: [] }));
		const payload = { gty: "client_credentials", sub: "abc@clients", permissions: ["write:search-index"] } as unknown as Auth0JwtPayload;
		expect((await post(payload, fetcher)).status).toBe(200);
		expect(calls).toHaveLength(1);
	});

	it("is 401 for a token that is not a valid Auth0 JWT, through the route factory and Auth0 middleware", async () => {
		const { fetcher, calls } = binding(() => Response.json({}));
		const app = new Hono<{ Bindings: Env }>();
		fromHono(app).post("/search/admin/docs", createOpenApiRoute(searchAdminDocs, { auth: searchIndexWriteAuth }));
		const resp = await app.request(
			"/search/admin/docs",
			{ method: "POST", headers: { ...authJsonHeaders, Authorization: "Bearer not-a-jwt" }, body: JSON.stringify(body) },
			testEnv({ SEARCH: fetcher, auth0Issuer: "https://auth.example.com/", auth0Audience: "https://api.cultpodcasts.com/" })
		);
		expect(resp.status).toBe(401);
		expect(calls).toEqual([]);
	});

	it("writes through to D1 end to end (search Worker behind the binding)", async () => {
		const db = migratedSearchDb();
		const { fetcher } = binding((req) => searchWorker.fetch(req, { SEARCH_DB: d1(db) }));
		const resp = await post(M2M_WRITER, fetcher);
		expect(await resp.json()).toEqual({ upserted: 1, deleted: 0, stale: [], notFound: [] });
		expect(db.prepare("SELECT id, title FROM search_docs").all()).toEqual([{ id: "ep-1", title: "Xenu" }]);
	});

	it.each([
		["no token", null, 401],
		["an M2M token without write:search-index", { gty: "client_credentials", sub: "abc@clients", scope: "submit" }, 403],
		["an M2M token with no permissions", { gty: "client_credentials", sub: "abc@clients", scope: "" }, 403],
		[
			"a person's token with write:search-index (not client_credentials)",
			{ sub: "auth0|person", permissions: ["write:search-index"], scope: "write:search-index" },
			403
		]
	] as const)("refuses %s without calling the search Worker", async (_name, payload, status) => {
		const { fetcher, calls } = binding(() => Response.json({}));
		const resp = await post(payload as unknown as Auth0JwtPayload | null, fetcher);
		expect(resp.status).toBe(status);
		expect(calls).toEqual([]);
	});

	it("passes the search Worker's 400 and 503 through unchanged", async () => {
		for (const [status, error] of [
			[400, { error: { code: "", message: "upserts[0].modifiedAt must be a non-negative integer (epoch milliseconds)" } }],
			[503, { error: { code: "ServiceUnavailable", message: "Search is temporarily unavailable." } }]
		] as const) {
			const { fetcher } = binding(() => Response.json(error, { status }));
			const resp = await post(M2M_WRITER, fetcher);
			expect(resp.status).toBe(status);
			expect(await resp.json()).toEqual(error);
		}
	});

	it("is 503 when the Worker has no SEARCH binding, and 502 when the binding call throws", async () => {
		expect((await post(M2M_WRITER, undefined)).status).toBe(503);
		const { fetcher } = binding(() => {
			throw new Error("binding down");
		});
		const resp = await post(M2M_WRITER, fetcher);
		expect(resp.status).toBe(502);
		expect(await resp.json()).toEqual({ error: { code: "UpstreamSearchError", message: "Upstream search unavailable" } });
	});
});
