import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Hono } from "hono";
import type { Env } from "../src/Env";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";
import type { Auth0ActionContext } from "../src/Auth0ActionContext";
import { submitLookup } from "../src/submitLookup";
import { submitUrlLookupQuerySchema, submitUrlLookupResponseSchema } from "../src/openapiSchemas";

const authHeaders = { Authorization: "Bearer test-token" };

function testEnv(): Env {
	return {
		secureSubmitEndpoint: new URL("https://functions.example/api/SubmitUrl"),
		stagingHostSuffix: ""
	} as Env;
}

function appWithPermissions(permissions: string[]) {
	const app = new Hono<{ Bindings: Env }>();
	app.use("*", async (c, next) => {
		c.set("auth0", () => ({
			permissions,
			scope: permissions.join(" ")
		} as Auth0JwtPayload));
		await next();
	});
	app.get("/submit/lookup", (c) => submitLookup(c as Auth0ActionContext));
	return app;
}

describe("GET /submit/lookup", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("forwards GET to Azure SubmitUrl with the encoded url query and does not D1-write", async () => {
		const episodeUrl = "https://open.spotify.com/episode/opaqueid00000000000000";
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						known: true,
						podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
						podcastName: "Stored Show Name"
					}),
					{ status: 200 }
				)
		);
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(["submit"]);

		const resp = await app.request(
			`/submit/lookup?url=${encodeURIComponent(episodeUrl)}`,
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({
			known: true,
			podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			podcastName: "Stored Show Name"
		});
		expect(fetchMock).toHaveBeenCalledOnce();
		const requested = String(fetchMock.mock.calls[0][0]);
		expect(requested).toContain("https://functions.example/api/SubmitUrl?");
		expect(requested).toContain(`url=${encodeURIComponent(episodeUrl)}`);
		expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET" });
	});

	it("forwards Azure 400 for a non-http url without falling back to D1", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ error: "Url must be an absolute http or https URL" }),
						{ status: 400 }
					)
			)
		);
		const app = appWithPermissions(["submit"]);

		const resp = await app.request(
			"/submit/lookup?url=ftp://example.com/episode",
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual({
			error: "Url must be an absolute http or https URL"
		});
	});

	it("forwards unknown streaming membership as 200", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ known: false, kind: "streaming" }),
						{ status: 200 }
					)
			)
		);
		const app = appWithPermissions(["submit"]);

		const resp = await app.request(
			`/submit/lookup?url=${encodeURIComponent("https://www.bbc.co.uk/sounds/play/p0example")}`,
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ known: false, kind: "streaming" });
	});

	it("forwards unknown podcast-service membership as 200", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ known: false, kind: "podcast-service" }),
						{ status: 200 }
					)
			)
		);
		const app = appWithPermissions(["submit"]);

		const resp = await app.request(
			`/submit/lookup?url=${encodeURIComponent("https://open.spotify.com/episode/opaqueid00000000000000")}`,
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ known: false, kind: "podcast-service" });
	});

	it("returns 403 when authenticated without submit permission", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(["curate"]);

		const resp = await app.request(
			"/submit/lookup?url=https://example.com/x",
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("source-forwards 400 and uses GET SubmitUrl with query append", () => {
		const src = readFileSync(resolve(process.cwd(), "src/submitLookup.ts"), "utf8");
		expect(src).toContain("forwardStatuses: [400]");
		expect(src).toContain('method: "GET"');
		expect(src).toContain("appendRequestSearch: true");
		expect(src).toContain("Endpoint.submit");
		expect(src).not.toContain("prisma");
		expect(src).not.toContain("apiDB");
	});

	it("documents query url and 200 ambiguous membership in OpenAPI", () => {
		const routes = readFileSync(resolve(process.cwd(), "src/openapiSubmitPodcastRoutes.ts"), "utf8");
		const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
		expect(index).toContain("openapi.get('/submit/lookup', SubmitLookupRoute)");
		expect(routes).toMatch(/ambiguous true/);
		expect(routes).toContain("submitUrlLookupQuerySchema");
		expect(routes).toContain("Url must be an absolute http or https URL");
		expect(
			submitUrlLookupResponseSchema.parse({
				known: false,
				ambiguous: true,
				podcastIds: [
					"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
					"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
				]
			}).ambiguous
		).toBe(true);
		expect(submitUrlLookupQuerySchema.parse({ url: "https://example.com/x" }).url).toContain("example.com");
	});
});
