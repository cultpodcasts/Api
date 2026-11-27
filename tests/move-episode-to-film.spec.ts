import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({
	ImageResponse: class ImageResponse {}
}));

import { moveEpisodeToFilm } from "../src/moveEpisodeToFilm";
import { MoveEpisodeToFilmRoute } from "../src/openapiRoutes";
import {
	episodeFilmMoveResponseSchema,
	podcastEpisodeFilmMoveRequestSchema
} from "../src/openapiSchemas";
import { registerOpenApiRoutes } from "../src/registerOpenApiRoutes";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const podcastId = "7d1b9c40-2f6e-4a8b-9c3d-1e2f3a4b5c6d";
const episodeId = "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d";
const filmPath = `/episode/${podcastId}/${episodeId}/film`;
const route = "/episode/:podcastId/:episodeId/film";

function appWithCurate() {
	return appWithPermissions(route, "post", moveEpisodeToFilm, ["curate"]);
}

describe("move episode to film", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("POSTs Azure /episode/{podcastId}/{episodeId}/film with the title and returns 202", async () => {
		const outcome = { filmId: episodeId, name: "Synthetic Film Title", failureIndexing: false };
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(outcome), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await appWithCurate().request(
			filmPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ title: "Synthetic Film Title" }) },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(outcome);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(String(url).endsWith(`/episode/${podcastId}/${episodeId}/film`)).toBe(true);
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual({ title: "Synthetic Film Title" });
	});

	it("passes filmId through to Azure for Move to an existing film (RPP #1522) and returns the 202 outcome", async () => {
		const existingFilmId = "925e2a11-668f-4dfa-a78d-57dd4de0051f";
		const outcome = { filmId: existingFilmId, name: "Manic" };
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(outcome), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await appWithCurate().request(
			filmPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ filmId: existingFilmId }) },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(outcome);
		const [, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({ filmId: existingFilmId });
	});

	it("forwards the 409 when the existing film already has a different Spotify or Apple link (RPP #1411: a different YouTube becomes an additional upload)", async () => {
		const outcome = {
			filmId: "925e2a11-668f-4dfa-a78d-57dd4de0051f",
			name: "Manic",
			error: "Film 'Manic' already has a different spotify link (https://open.spotify.com/episode/synthetic)."
		};
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(outcome), { status: 409 })));

		const resp = await appWithCurate().request(
			filmPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ filmId: outcome.filmId }) },
			testEnv()
		);

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(outcome);
	});

	it("sends {} to Azure when the request has no body", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ filmId: episodeId }), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await appWithCurate().request(
			filmPath,
			{ method: "POST", headers: authJsonHeaders },
			testEnv()
		);

		expect(resp.status).toBe(202);
		const [, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({});
	});

	it("returns 400 for a malformed body without calling Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const resp = await appWithCurate().request(
			filmPath,
			{ method: "POST", headers: authJsonHeaders, body: "{not json" },
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 403, not 400, for a malformed body without curate", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "post", moveEpisodeToFilm, ["submit"]);

		const resp = await app.request(
			filmPath,
			{ method: "POST", headers: authJsonHeaders, body: "{not json" },
			testEnv()
		);

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 403 without curate", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "post", moveEpisodeToFilm, ["submit"]);

		const resp = await app.request(
			filmPath,
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		[400, { error: "Film name cannot contain '/'" }],
		[404, { podcastId, episodeId }],
		[409, { filmId: episodeId, name: "Synthetic Film Title", error: "A film with this name already exists", failureIndexing: false }]
	] as const)("passes Azure %s through", async (status, body) => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

		const resp = await appWithCurate().request(
			filmPath,
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});

	it("forwards Azure 200 identityDecision and select re-POST body (ambiguous IMDb/TMDB)", async () => {
		const decision = {
			identityDecision: {
				target: "Film",
				query: "Synthetic Film",
				candidates: [{ key: "tmdb:42", title: "Synthetic Film", year: 2020, kind: "Film", source: "tmdb" }]
			}
		};
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(decision), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const probe = await appWithCurate().request(
			filmPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ title: "Synthetic Film" }) },
			testEnv()
		);
		expect(probe.status).toBe(200);
		expect(await probe.json()).toEqual(decision);

		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ filmId: episodeId, name: "Synthetic Film", failureIndexing: false }), { status: 202 })
		);
		const select = await appWithCurate().request(
			filmPath,
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					title: "Synthetic Film",
					identityDecision: "select",
					selectedIdentityKey: "tmdb:42"
				})
			},
			testEnv()
		);
		expect(select.status).toBe(202);
		const [, init] = fetchMock.mock.calls[1] as [URL | string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({
			title: "Synthetic Film",
			identityDecision: "select",
			selectedIdentityKey: "tmdb:42"
		});
	});
});

describe("move episode to film route registration", () => {
	it("registers openapi.post /episode/:podcastId/:episodeId/film with documented schemas", () => {
		const registered = registerOpenApiRoutes({
			get: () => undefined,
			post: () => undefined,
			put: () => undefined,
			patch: () => undefined,
			delete: () => undefined
		});
		expect(
			registered.some(
				(r) =>
					r.method === "post" &&
					r.path === "/episode/:podcastId/:episodeId/film" &&
					r.route === MoveEpisodeToFilmRoute
			)
		).toBe(true);

		type JsonContent = { content?: { "application/json"?: { schema?: unknown } } };
		const request = MoveEpisodeToFilmRoute.openApiSchema.request as
			| { body?: JsonContent }
			| undefined;
		const response202 = MoveEpisodeToFilmRoute.openApiSchema.responses?.[202] as
			| JsonContent
			| undefined;
		expect(request?.body?.content?.["application/json"]?.schema).toBe(
			podcastEpisodeFilmMoveRequestSchema
		);
		expect(response202?.content?.["application/json"]?.schema).toBe(episodeFilmMoveResponseSchema);
	});
});
