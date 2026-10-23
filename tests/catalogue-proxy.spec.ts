import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import type { Auth0ActionContext } from "../src/Auth0ActionContext";
import { ambiguousCatalogueNameConflict, ambiguousPodcastNameConflict } from "../src/openapiRouteFactory";
import { getFilm } from "../src/getFilm";
import {
	GetFilmRoute,
	GetTvShowEpisodeRoute,
	GetTvShowRoute,
	UpdateFilmRoute,
	UpdateTvShowEpisodeRoute,
	UpdateTvShowRoute
} from "../src/openapiRoutes";
import { serviceIdConflictSchema, tvShowEpisodeChangeRequestSchema } from "../src/openapiSchemas";
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
	return testEnv();
}

type TestHttpMethod = "get" | "post" | "patch";

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
		["PATCH", "/tvshow/:id", `/tvshow/${id}`, "patch", updateTvShow],
		["PATCH", "/film/:id", `/film/${id}`, "patch", updateFilm],
		["PATCH", "/tvshowepisode/:id", `/tvshowepisode/${id}`, "patch", updateTvShowEpisode]
	] as const)(
		"%s %s returns 403 without curate and does not call Azure",
		async (_methodLabel, route, requestPath, method, handler) => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			const app = appFor(route, method, handler, ["submit"]);
			const resp = await app.request(
				requestPath,
				{
					method: "PATCH",
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
		[
			"/tvshow/:id",
			`/tvshow/${id}`,
			updateTvShow,
			"/tvshow/",
			{ imdb: "", searchTerms: "synthetic", language: "fr", enrichmentHashTags: [], defaultSubject: "", publisher: "Synthetic Studios", description: "", removed: true, youTubeChannelId: "UCsyntheticChannel0000001", spotifyId: "", appleId: 1, nullAppleId: false }
		],
		[
			"/tvshowepisode/:id",
			`/tvshowepisode/${id}`,
			updateTvShowEpisode,
			"/tvshowepisode/",
			{ tvdb: null, title: "Synthetic", release: "2026-10-02", duration: "0:44:00", removed: true, guests: [], posted: true, tweeted: false, unBluesky: true }
		],
		[
			"/film/:id",
			`/film/${id}`,
			updateFilm,
			"/film/",
			{ imdb: "https://www.imdb.com/title/tt0000003/", release: "1999", guests: ["Synthetic Director"], hashTag: "", publisher: "Synthetic Pictures", tweeted: false, unBluesky: true }
		]
	] as const)(
		"PATCH %s passes the RPP #1053 parity fields (incl. publisher / removed / post status) through to Azure unchanged and forwards 202",
		async (route, requestPath, handler, azurePrefix, payload) => {
			const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
			vi.stubGlobal("fetch", fetchMock);
			const app = appFor(route, "patch", handler, ["curate"]);
			const resp = await app.request(
				requestPath,
				{ method: "PATCH", headers: authJsonHeaders, body: JSON.stringify(payload) },
				catalogueEnv()
			);
			expect(resp.status).toBe(202);
			const [url, init] = fetchMock.mock.calls[0] as unknown as [URL | string, RequestInit];
			expect(String(url).endsWith(`${azurePrefix}${encodeURIComponent(id)}`)).toBe(true);
			expect(init.method).toBe("PATCH");
			expect(JSON.parse(String(init.body))).toEqual(payload);
		}
	);

	it.each([
		["/tvshowepisode/:id", `/tvshowepisode/${id}`, updateTvShowEpisode],
		["/film/:id", `/film/${id}`, updateFilm]
	] as const)("PATCH %s forwards the episode-style 202 outcome body", async (route, requestPath, handler) => {
		const outcome = { tweetDeleted: false, blueskyPostDeleted: true, searchIndexerState: null };
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(outcome), { status: 202 })));
		const app = appFor(route, "patch", handler, ["curate"]);
		const resp = await app.request(
			requestPath,
			{ method: "PATCH", headers: authJsonHeaders, body: JSON.stringify({ tweeted: false, unBluesky: true }) },
			catalogueEnv()
		);
		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(outcome);
	});

	it.each([
		["/tvshow/:identifier", `/tvshow/${id}`, getTvShow, { id, name: "Synthetic", searchTerms: "s", knownTerms: ["K"], removed: false }],
		["/film/:identifier", `/film/${id}`, getFilm, { id, name: "Synthetic", release: "1999", guests: ["G"], subjects: [] }],
		[
			"/tvshowepisode/:id",
			`/tvshowepisode/${id}`,
			getTvShowEpisode,
			{ id, tvShowId: id, title: "Synthetic", guests: ["G"], duration: "0:44:00", subjects: ["S"] }
		]
	] as const)("GET %s passes the RPP #1053 parity fields through unchanged", async (route, requestPath, handler, body) => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
		const app = appFor(route, "get", handler, ["curate"]);
		const resp = await app.request(requestPath, { method: "GET", headers: authJsonHeaders }, catalogueEnv());
		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(body);
	});

	it.each([
		["/tvshow/:identifier", `/tvshow/${id}`, getTvShow, "/tvshow/"],
		["/film/:identifier", `/film/${id}`, getFilm, "/film/"]
	] as const)("GET %s forwards 200, 401, 404, 409 and 500 bodies and hits Azure %s{id}", async (route, requestPath, handler, azurePrefix) => {
		for (const [status, body] of [
			[200, { id, name: "Show" }],
			[401, { Message: "Unauthorised" }],
			[404, { error: "Not found" }],
			[409, ambiguousIds],
			[500, { error: "Unable to retrieve" }]
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

	it("GET /tvshowepisode/:id forwards 200, 401, 404 and 500, hits Azure /tvshowepisode/{id}, and maps 409 to 500", async () => {
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

		for (const [status, body] of [
			[401, { Message: "Unauthorised" }],
			[500, { error: "Unable to retrieve TV-show episode" }]
		] as const) {
			vi.unstubAllGlobals();
			vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
			const forwarded = await app.request(`/tvshowepisode/${id}`, { method: "GET", headers: authJsonHeaders }, catalogueEnv());
			expect(forwarded.status).toBe(status);
			expect(await forwarded.json()).toEqual(body);
		}

		vi.unstubAllGlobals();
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ambiguousIds), { status: 409 })));
		const clash = await app.request(`/tvshowepisode/${id}`, { method: "GET", headers: authJsonHeaders }, catalogueEnv());
		expect(clash.status).toBe(500);
	});

	it.each([
		["/tvshow/:id", `/tvshow/${id}`, updateTvShow, "/tvshow/"],
		["/film/:id", `/film/${id}`, updateFilm, "/film/"],
		["/tvshowepisode/:id", `/tvshowepisode/${id}`, updateTvShowEpisode, "/tvshowepisode/"]
	] as const)("PATCH %s returns 202 empty, forwards 400/401/404/500 bodies, hits Azure %s{id}", async (route, requestPath, handler, azurePrefix) => {
		const fetch202 = vi.fn(async () => new Response(null, { status: 202 }));
		vi.stubGlobal("fetch", fetch202);
		const app = appFor(route, "patch", handler, ["curate"]);
		const patchBody = JSON.stringify({ imdb: "https://www.imdb.com/title/tt0111161/" });
		const accepted = await app.request(
			requestPath,
			{ method: "PATCH", headers: authJsonHeaders, body: patchBody },
			catalogueEnv()
		);
		expect(accepted.status).toBe(202);
		expect(await accepted.text()).toBe("");
		const [url, init] = fetch202.mock.calls[0] as [URL | string, { method?: string }];
		expect(String(url).endsWith(`${azurePrefix}${encodeURIComponent(id)}`)).toBe(true);
		expect(init.method).toBe("PATCH");

		for (const status of [400, 401, 404, 500] as const) {
			vi.unstubAllGlobals();
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(JSON.stringify({ error: `upstream ${status}` }), { status }))
			);
			const forwarded = await app.request(
				requestPath,
				{ method: "PATCH", headers: authJsonHeaders, body: patchBody },
				catalogueEnv()
			);
			expect(forwarded.status).toBe(status);
			expect(await forwarded.json()).toEqual({ error: `upstream ${status}` });
		}
	});

	it("PATCH /tvshow/:id passes the RPP #1053 service-id 409 {message, ids} through; PATCH /film/:id passes 409 through; episode PATCH maps an unexpected 409 to 500", async () => {
		const conflict = { message: "spotifyId is already used", ids: [ambiguousIds[1]] };
		const patchBody = JSON.stringify({ spotifyId: "syntheticSpotifyId" });
		for (const [route, requestPath, handler, expected] of [
			["/tvshow/:id", `/tvshow/${id}`, updateTvShow, 409],
			["/film/:id", `/film/${id}`, updateFilm, 409],
			["/tvshowepisode/:id", `/tvshowepisode/${id}`, updateTvShowEpisode, 500]
		] as const) {
			vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(conflict), { status: 409 })));
			const app = appFor(route, "patch", handler, ["curate"]);
			const resp = await app.request(requestPath, { method: "PATCH", headers: authJsonHeaders, body: patchBody }, catalogueEnv());
			expect(resp.status).toBe(expected);
			if (expected === 409) {
				expect(await resp.json()).toEqual(conflict);
			}
			vi.unstubAllGlobals();
		}
	});

	it("PATCH /film/:id forwards expectedTrailerIds and the stale-trailer 409 body", async () => {
		const trailerId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
		const attachedId = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
		const payload = {
			trailers: [{ id: trailerId, title: "Synthetic Teaser" }],
			expectedTrailerIds: [trailerId]
		};
		const conflict = {
			message: "The film's trailers changed after this edit was loaded. Close and reopen the film to edit its trailers.",
			unexpectedTrailerIds: [attachedId]
		};
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(conflict), { status: 409 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appFor("/film/:id", "patch", updateFilm, ["curate"]);
		const resp = await app.request(
			`/film/${id}`,
			{ method: "PATCH", headers: authJsonHeaders, body: JSON.stringify(payload) },
			catalogueEnv()
		);
		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(conflict);
		const [, init] = fetchMock.mock.calls[0] as unknown as [URL | string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual(payload);
	});
});

describe("catalogue OpenAPI contracts", () => {
	it("uses a Catalogue 409 object distinct from podcast name clash", () => {
		expect(ambiguousCatalogueNameConflict.description).toMatch(/TV show or film/i);
		expect(ambiguousPodcastNameConflict.description).toMatch(/podcast/i);
		expect(ambiguousCatalogueNameConflict).not.toBe(ambiguousPodcastNameConflict);
	});

	it("documents GET film/TV 409 as the catalogue ambiguity, none on GET episode, and the TV-episode PATCH body", () => {
		expect(GetTvShowRoute.openApiSchema.responses?.[409]).toBe(ambiguousCatalogueNameConflict);
		expect(GetFilmRoute.openApiSchema.responses?.[409]).toBe(ambiguousCatalogueNameConflict);
		expect(GetTvShowEpisodeRoute.openApiSchema.responses?.[409]).toBeUndefined();
		const request = UpdateTvShowEpisodeRoute.openApiSchema.request as
			| { body?: { content?: { "application/json"?: { schema?: unknown } } } }
			| undefined;
		expect(request?.body?.content?.["application/json"]?.schema).toBe(tvShowEpisodeChangeRequestSchema);
	});

	it("documents the RPP #1053 service-id 409 and a retryable 500 on PATCH /tvshow, the film stale-trailer 409, and no 409 on episode PATCH", () => {
		const responses = UpdateTvShowRoute.openApiSchema.responses;
		const conflict = responses?.[409] as { description?: string; content?: { "application/json"?: { schema?: unknown } } } | undefined;
		expect(conflict?.content?.["application/json"]?.schema).toBe(serviceIdConflictSchema);
		expect(conflict?.description).toMatch(/spotifyId/);
		expect(responses?.[500]?.description).toMatch(/retry/i);
		const filmConflict = UpdateFilmRoute.openApiSchema.responses?.[409] as { description?: string } | undefined;
		expect(filmConflict?.description).toMatch(/expectedTrailerIds/);
		expect(UpdateTvShowEpisodeRoute.openApiSchema.responses?.[409]).toBeUndefined();
	});
});
