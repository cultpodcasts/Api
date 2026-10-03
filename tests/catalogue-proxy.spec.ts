import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Auth0ActionContext } from "../src/Auth0ActionContext";
import { ambiguousCatalogueNameConflict, ambiguousPodcastNameConflict } from "../src/openapiRouteFactory";
import { getFilm } from "../src/getFilm";
import { getTvShow } from "../src/getTvShow";
import { getTvShowEpisode } from "../src/getTvShowEpisode";
import { updateFilm } from "../src/updateFilm";
import { updateTvShow } from "../src/updateTvShow";
import { updateTvShowEpisode } from "../src/updateTvShowEpisode";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const id = "550e8400-e29b-41d4-a716-446655440000";
const ambiguousIds = [
	"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
];

function catalogueEnv() {
	return testEnv({
		securePodcastEndpoint: new URL("https://functions.example/api/podcast"),
		secureEpisodeEndpoint: new URL("https://functions.example/api/episode")
	});
}

type TestHttpMethod = "get" | "post";

function appFor(
	path: string,
	method: TestHttpMethod,
	handler: (c: Auth0ActionContext) => Promise<Response>,
	permissions: string[]
) {
	return appWithPermissions(path, method, handler, permissions);
}

describe("catalogue Azure proxies", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each([
		["GET", "/tvshow/:identifier", `/tvshow/${id}`, "get", getTvShow, `/${encodeURIComponent(id)}`, "/tvshow/"],
		["GET", "/film/:identifier", `/film/${id}`, "get", getFilm, `/${encodeURIComponent(id)}`, "/film/"],
		[
			"GET",
			"/tvshowepisode/:id",
			`/tvshowepisode/${id}`,
			"get",
			getTvShowEpisode,
			`/${encodeURIComponent(id)}`,
			"/tvshowepisode/"
		]
	] as const)(
		"%s %s returns 403 without curate and does not call Azure",
		async (_methodLabel, route, requestPath, method, handler) => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			const app = appFor(route, method, handler, ["submit"]);
			const resp = await app.request(requestPath, { method: method.toUpperCase(), headers: authJsonHeaders }, catalogueEnv());
			expect(resp.status).toBe(403);
			expect(fetchMock).not.toHaveBeenCalled();
		}
	);

	it.each([
		["POST", "/tvshow/:id", `/tvshow/${id}`, "post", updateTvShow],
		["POST", "/film/:id", `/film/${id}`, "post", updateFilm],
		["POST", "/tvshowepisode/:id", `/tvshowepisode/${id}`, "post", updateTvShowEpisode]
	] as const)(
		"%s %s returns 403 without curate and does not call Azure",
		async (_methodLabel, route, requestPath, method, handler) => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			const app = appFor(route, method, handler, ["submit"]);
			const resp = await app.request(
				requestPath,
				{
					method: "POST",
					headers: authJsonHeaders,
					body: JSON.stringify({ imdb: "https://www.imdb.com/title/tt0111161/" })
				},
				catalogueEnv()
			);
			expect(resp.status).toBe(403);
			expect(fetchMock).not.toHaveBeenCalled();
		}
	);

	it.each([
		["/tvshow/:identifier", `/tvshow/${id}`, getTvShow, "/tvshow/"],
		["/film/:identifier", `/film/${id}`, getFilm, "/film/"]
	] as const)("GET %s forwards 200, 404, and 409 and hits Azure %s{id}", async (route, requestPath, handler, azurePrefix) => {
		for (const [status, body] of [
			[200, { id, name: "Show" }],
			[404, { error: "Not found" }],
			[409, ambiguousIds]
		] as const) {
			const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
			vi.stubGlobal("fetch", fetchMock);
			const app = appFor(route, "get", handler, ["curate"]);
			const resp = await app.request(requestPath, { method: "GET", headers: authJsonHeaders }, catalogueEnv());
			expect(resp.status).toBe(status);
			expect(await resp.json()).toEqual(body);
			const [url] = fetchMock.mock.calls[0] as [URL | string];
			expect(String(url).endsWith(`${azurePrefix}${encodeURIComponent(id)}`)).toBe(true);
			vi.unstubAllGlobals();
		}
	});

	it("GET /tvshowepisode/:id forwards 200 and 404, hits Azure /tvshowepisode/{id}, and maps 409 to 500", async () => {
		const fetch200 = vi.fn(
			async () =>
				new Response(JSON.stringify({ id, tvShowId: id, title: "Ep" }), { status: 200 })
		);
		vi.stubGlobal("fetch", fetch200);
		const app = appFor("/tvshowepisode/:id", "get", getTvShowEpisode, ["curate"]);
		const ok = await app.request(`/tvshowepisode/${id}`, { method: "GET", headers: authJsonHeaders }, catalogueEnv());
		expect(ok.status).toBe(200);
		const [okUrl] = fetch200.mock.calls[0] as [URL | string];
		expect(String(okUrl).endsWith(`/tvshowepisode/${encodeURIComponent(id)}`)).toBe(true);

		vi.unstubAllGlobals();
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Not found" }), { status: 404 })));
		const missing = await app.request(`/tvshowepisode/${id}`, { method: "GET", headers: authJsonHeaders }, catalogueEnv());
		expect(missing.status).toBe(404);

		vi.unstubAllGlobals();
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ambiguousIds), { status: 409 })));
		const clash = await app.request(`/tvshowepisode/${id}`, { method: "GET", headers: authJsonHeaders }, catalogueEnv());
		expect(clash.status).toBe(500);
	});

	it.each([
		["/tvshow/:id", `/tvshow/${id}`, updateTvShow, "/tvshow/"],
		["/film/:id", `/film/${id}`, updateFilm, "/film/"],
		["/tvshowepisode/:id", `/tvshowepisode/${id}`, updateTvShowEpisode, "/tvshowepisode/"]
	] as const)("POST %s returns 202 empty, forwards 400/404, hits Azure %s{id}", async (route, requestPath, handler, azurePrefix) => {
		const fetch202 = vi.fn(async () => new Response(null, { status: 202 }));
		vi.stubGlobal("fetch", fetch202);
		const app = appFor(route, "post", handler, ["curate"]);
		const patchBody = JSON.stringify({ imdb: "https://www.imdb.com/title/tt0111161/" });
		const accepted = await app.request(
			requestPath,
			{ method: "POST", headers: authJsonHeaders, body: patchBody },
			catalogueEnv()
		);
		expect(accepted.status).toBe(202);
		expect(await accepted.text()).toBe("");
		const [url] = fetch202.mock.calls[0] as [URL | string];
		expect(String(url).endsWith(`${azurePrefix}${encodeURIComponent(id)}`)).toBe(true);

		for (const status of [400, 404] as const) {
			vi.unstubAllGlobals();
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(JSON.stringify({ error: "upstream" }), { status }))
			);
			const forwarded = await app.request(
				requestPath,
				{ method: "POST", headers: authJsonHeaders, body: patchBody },
				catalogueEnv()
			);
			expect(forwarded.status).toBe(status);
		}
	});
});

describe("catalogue OpenAPI contracts", () => {
	it("uses a Catalogue 409 object distinct from podcast name clash", () => {
		expect(ambiguousCatalogueNameConflict.description).toMatch(/TV show or film/i);
		expect(ambiguousPodcastNameConflict.description).toMatch(/podcast/i);
		expect(ambiguousCatalogueNameConflict).not.toBe(ambiguousPodcastNameConflict);
	});

	it("wires GET film/TV 409 and TV-episode PATCH schema in openapiRoutes", () => {
		const src = readFileSync(resolve(process.cwd(), "src/openapiRoutes.ts"), "utf8");
		const getTvShow = src.slice(
			src.indexOf("export const GetTvShowRoute"),
			src.indexOf("export const GetTvShowEpisodeRoute")
		);
		const getEpisode = src.slice(
			src.indexOf("export const GetTvShowEpisodeRoute"),
			src.indexOf("export const UpdateTvShowEpisodeRoute")
		);
		const getFilm = src.slice(
			src.indexOf("export const GetFilmRoute"),
			src.indexOf("export const UpdateFilmRoute")
		);
		expect(getTvShow).toContain("409: ambiguousCatalogueNameConflict");
		expect(getTvShow).not.toContain("ambiguousPodcastNameConflict");
		expect(getFilm).toContain("409: ambiguousCatalogueNameConflict");
		expect(getFilm).not.toContain("ambiguousPodcastNameConflict");
		expect(getEpisode).not.toContain("409:");
		expect(src).toContain("jsonBody(tvShowEpisodeChangeRequestSchema)");
	});
});
