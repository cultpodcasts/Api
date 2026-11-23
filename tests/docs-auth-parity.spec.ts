import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
vi.mock("@cfworker/jwt", () => ({ parseJwt: vi.fn() }));

import { parseJwt } from "@cfworker/jwt";
import worker from "../src/index";
import { testEnv } from "./support/honoRoute";

/**
 * `/docs`, `/docs/search-shadow-soak` and `/openapi.json` share one gate (requireOpenApiAuth): a
 * verified Auth0 token with `admin`, from the bearer header or the docs-session cookie (Api #310).
 */
const TOKENS: Record<string, string[] | null> = {
	"admin-token": ["admin"],
	"curator-token": ["curate"],
	"stale-token": null
};

const ROUTES = ["/docs", "/docs/search-shadow-soak", "/openapi.json"] as const;

async function get(path: string, auth: { bearer?: string; cookie?: string } = {}) {
	const headers: Record<string, string> = {};
	if (auth.bearer) headers.authorization = `Bearer ${auth.bearer}`;
	if (auth.cookie) headers.cookie = `openapi_access_token=${auth.cookie}`;
	return worker.fetch(new Request(`https://api.example${path}`, { headers }), testEnv(), {} as ExecutionContext);
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.mocked(parseJwt).mockReset();
	vi.mocked(parseJwt).mockImplementation((async (token: string) => {
		const permissions = TOKENS[token];
		return permissions ? { valid: true, payload: { sub: "auth0|jon", permissions } } : { valid: false, reason: "expired" };
	}) as never);
});

describe("docs gate parity (Api #310)", () => {
	it.each(ROUTES)("%s refuses anonymous callers", async (path) => {
		const resp = await get(path);
		if (path === "/openapi.json") {
			expect(resp.status).toBe(401);
		} else {
			expect(resp.status).toBe(302);
			expect(resp.headers.get("location")).toBe("/docs/login");
		}
	});

	it.each(ROUTES)("%s refuses a verified token without admin (bearer or cookie)", async (path) => {
		expect((await get(path, { bearer: "curator-token" })).status).toBe(403);
		expect((await get(path, { cookie: "curator-token" })).status).toBe(403);
	});

	it.each(ROUTES)("%s refuses an unverifiable token", async (path) => {
		const resp = await get(path, { cookie: "stale-token" });
		expect(resp.status).toBe(path === "/openapi.json" ? 401 : 302);
	});

	it.each(ROUTES)("%s lets an admin docs session through", async (path) => {
		const resp = await get(path, { cookie: "admin-token" });
		expect([401, 403, 302]).not.toContain(resp.status);
	});

	it("serves /openapi.json to an admin docs session even when Swagger sends a stale saved bearer", async () => {
		const resp = await get("/openapi.json", { bearer: "stale-token", cookie: "admin-token" });
		expect(resp.status).toBe(200);
		expect(((await resp.json()) as { openapi?: string }).openapi).toMatch(/^3\./);
	});

	it("still refuses when the bearer is stale and the cookie lacks admin", async () => {
		expect((await get("/openapi.json", { bearer: "stale-token", cookie: "curator-token" })).status).toBe(403);
	});

	it("does not let a cookie upgrade a verified non-admin bearer", async () => {
		expect((await get("/docs/search-shadow-soak", { bearer: "curator-token", cookie: "admin-token" })).status).toBe(403);
	});
});
