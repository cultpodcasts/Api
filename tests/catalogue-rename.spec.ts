import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogueRenameRequestSchema, catalogueRenameResponseSchema, podcastRenameResponseSchema } from "../src/openapiSchemas";
import { renameFilm, renameNewsOrganisation, renameTvShow } from "../src/renameCatalogue";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const id = "550e8400-e29b-41d4-a716-446655440000";
const ambiguousIds = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
const oldName = "Synthetic Drama & Co";

const routes = [
	["/newsorganisation/name/:identifier", "/newsorganisation/name/", renameNewsOrganisation, "/api/newsorganisation/name/"],
	["/tvshow/name/:identifier", "/tvshow/name/", renameTvShow, "/api/tvshow/name/"],
	["/film/name/:identifier", "/film/name/", renameFilm, "/api/film/name/"]
] as const;

function stubFetch(status: number, body: unknown) {
	const fetchMock = vi.fn(
		async () => new Response(body === null ? null : JSON.stringify(body), { status })
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const renameBody = JSON.stringify({ newName: "Synthetic Drama Revisited" });

describe("catalogue rename Azure proxies (RPP #1053)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each(routes)("POST %s needs admin like the podcast rename: curate alone is 403, with no Azure call", async (route, prefix, handler) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "post", handler, ["curate"]);
		const resp = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders, body: renameBody }, testEnv());
		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(routes)("POST %s returns 401 without a token payload and does not call Azure", async (route, prefix, handler) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload(route, "post", handler, null);
		const resp = await app.request(`${prefix}${id}`, { method: "POST", body: renameBody }, testEnv());
		expect(resp.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(routes)(
		"POST %s forwards the admin token, the encoded identifier and the body to Azure and passes the 200 {indexState} through",
		async (route, prefix, handler, azurePrefix) => {
			const fetchMock = stubFetch(200, { indexState: "Executed" });
			const app = appWithPermissions(route, "post", handler, ["admin"]);
			const resp = await app.request(
				`${prefix}${encodeURIComponent(oldName)}`,
				{ method: "POST", headers: authJsonHeaders, body: renameBody },
				testEnv()
			);
			expect(resp.status).toBe(200);
			expect(await resp.json()).toEqual({ indexState: "Executed" });
			const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
			expect(String(url)).toBe(`https://functions.example${azurePrefix}${encodeURIComponent(oldName)}`);
			expect(init?.method).toBe("POST");
			expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
			expect(JSON.parse(String(init?.body))).toEqual({ newName: "Synthetic Drama Revisited" });
		}
	);

	it.each(routes)("POST %s forwards 400, 404 and 409 (empty clash or ambiguous guid array) and maps other statuses to 500", async (route, prefix, handler) => {
		const app = appWithPermissions(route, "post", handler, ["admin"]);
		for (const [status, body] of [
			[400, null],
			[404, null],
			[409, null],
			[409, ambiguousIds]
		] as const) {
			stubFetch(status, body);
			const resp = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders, body: renameBody }, testEnv());
			expect(resp.status).toBe(status);
			if (body !== null) {
				expect(await resp.json()).toEqual(body);
			}
			vi.unstubAllGlobals();
		}
		stubFetch(500, { error: "Unable to rename" });
		const failed = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders, body: renameBody }, testEnv());
		expect(failed.status).toBe(500);
	});
});

describe("catalogue rename schemas and OpenAPI wiring", () => {
	const src = readFileSync(resolve(process.cwd(), "src/openapiRoutes.ts"), "utf8");
	const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");

	it("parses the rename body and the podcast-shaped response", () => {
		expect(catalogueRenameRequestSchema.parse({ newName: "Synthetic New" })).toEqual({ newName: "Synthetic New" });
		expect(() => catalogueRenameRequestSchema.parse({ newName: "" })).toThrow();
		expect(() => catalogueRenameRequestSchema.parse({ newPodcastName: "Synthetic New" })).toThrow();
		const response = { indexState: "NoDocuments" };
		expect(catalogueRenameResponseSchema.parse(response)).toEqual(podcastRenameResponseSchema.parse(response));
	});

	it("registers the three rename routes next to the podcast rename, with admin auth", () => {
		expect(index).toContain("openapi.post('/newsorganisation/name/:identifier', RenameNewsOrganisationRoute);");
		expect(index).toContain("openapi.post('/tvshow/name/:identifier', RenameTvShowRoute);");
		expect(index).toContain("openapi.post('/film/name/:identifier', RenameFilmRoute);");
		for (const name of ["RenameNewsOrganisationRoute", "RenameTvShowRoute", "RenameFilmRoute"]) {
			const start = src.indexOf(`export const ${name}`);
			expect(start).toBeGreaterThan(-1);
			expect(src.slice(start, start + 200)).toContain("auth: adminAuth");
		}
		expect(src).toContain("jsonBody(catalogueRenameRequestSchema)");
		expect(src).toContain("contentJson(catalogueRenameResponseSchema)");
	});
});
