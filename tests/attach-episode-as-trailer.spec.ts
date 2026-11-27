import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({
	ImageResponse: class ImageResponse {}
}));

import { attachEpisodeAsTrailer } from "../src/attachEpisodeAsTrailer";
import { AttachEpisodeAsTrailerRoute } from "../src/openapiRoutes";
import {
	episodeTrailerAttachRequestSchema,
	episodeTrailerAttachResponseSchema
} from "../src/openapiSchemas";
import { registerOpenApiRoutes } from "../src/registerOpenApiRoutes";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const podcastId = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const episodeId = "5e4d3c2b-1a09-4f8e-8d7c-6b5a4f3e2d1c";
const filmId = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f2a3b4c5d";
const trailerPath = `/episode/${podcastId}/${episodeId}/trailer`;
const route = "/episode/:podcastId/:episodeId/trailer";

function appWithCurate() {
	return appWithPermissions(route, "post", attachEpisodeAsTrailer, ["curate"]);
}

describe("attach episode as trailer", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("POSTs Azure /episode/{podcastId}/{episodeId}/trailer with filmId and title and returns 202", async () => {
		const outcome = { filmId, name: "Synthetic Film Title", failureIndexing: false };
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(outcome), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);
		const body = { filmId, title: "Synthetic Teaser" };

		const resp = await appWithCurate().request(
			trailerPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify(body) },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(outcome);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(String(url).endsWith(`/episode/${podcastId}/${episodeId}/trailer`)).toBe(true);
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual(body);
	});

	it("forwards createFilm, filmName and the identity answer to Azure and returns 202 with filmCreated", async () => {
		const outcome = { filmId, name: "Synthetic Unreleased Film", failureIndexing: false, filmCreated: true };
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(outcome), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);
		const body = {
			createFilm: true,
			filmName: "Synthetic Unreleased Film",
			identityDecision: "select",
			selectedIdentityKey: "tmdb:123"
		};

		const resp = await appWithCurate().request(
			trailerPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify(body) },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(outcome);
		const [, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual(body);
	});

	it("returns Azure's 200 identity prompt for createFilm, so the client can show the candidates", async () => {
		const prompt = {
			filmId: null,
			failureIndexing: false,
			identityDecision: {
				target: "Film",
				query: "Synthetic Unreleased Film",
				candidates: [{ key: "tmdb:123", title: "Synthetic Unreleased Film", year: 2026, kind: "Film", source: "tmdb", tmdbId: 123 }]
			}
		};
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(prompt), { status: 200 })));

		const resp = await appWithCurate().request(
			trailerPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ createFilm: true, filmName: "Synthetic Unreleased Film" }) },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(prompt);
	});

	it("sends {} to Azure when the request has no body, so Azure reports the missing filmId", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "filmId is required" }), { status: 400 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await appWithCurate().request(
			trailerPath,
			{ method: "POST", headers: authJsonHeaders },
			testEnv()
		);

		expect(resp.status).toBe(400);
		const [, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({});
	});

	it("returns 400 for a malformed body without calling Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const resp = await appWithCurate().request(
			trailerPath,
			{ method: "POST", headers: authJsonHeaders, body: "{not json" },
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 403 without curate, whatever the body", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "post", attachEpisodeAsTrailer, ["submit"]);

		const malformed = await app.request(
			trailerPath,
			{ method: "POST", headers: authJsonHeaders, body: "{not json" },
			testEnv()
		);
		const valid = await app.request(
			trailerPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ filmId }) },
			testEnv()
		);

		expect(malformed.status).toBe(403);
		expect(valid.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		[400, { error: "A removed film cannot take trailers" }],
		[404, { podcastId, episodeId, filmId, error: "Film not found" }],
		[409, { filmId, error: "This episode is already a trailer of another film", failureIndexing: false }],
		[500, { error: "Unable to attach episode as a trailer" }]
	] as const)("passes Azure %s through", async (status, body) => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

		const resp = await appWithCurate().request(
			trailerPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ filmId }) },
			testEnv()
		);

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});
});

describe("attach episode as trailer route registration", () => {
	it("registers openapi.post /episode/:podcastId/:episodeId/trailer with documented schemas", () => {
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
					r.path === "/episode/:podcastId/:episodeId/trailer" &&
					r.route === AttachEpisodeAsTrailerRoute
			)
		).toBe(true);

		type JsonContent = { content?: { "application/json"?: { schema?: unknown } } };
		const request = AttachEpisodeAsTrailerRoute.openApiSchema.request as
			| { body?: JsonContent }
			| undefined;
		const response202 = AttachEpisodeAsTrailerRoute.openApiSchema.responses?.[202] as
			| JsonContent
			| undefined;
		expect(request?.body?.content?.["application/json"]?.schema).toBe(
			episodeTrailerAttachRequestSchema
		);
		expect(response202?.content?.["application/json"]?.schema).toBe(
			episodeTrailerAttachResponseSchema
		);
	});
});
