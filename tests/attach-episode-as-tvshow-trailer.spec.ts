import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({
	ImageResponse: class ImageResponse {}
}));

import { attachEpisodeAsTvShowTrailer } from "../src/attachEpisodeAsTvShowTrailer";
import { AttachEpisodeAsTvShowTrailerRoute } from "../src/openapiRoutes";
import {
	episodeTvShowTrailerAttachRequestSchema,
	episodeTvShowTrailerAttachResponseSchema
} from "../src/openapiSchemas";
import { registerOpenApiRoutes } from "../src/registerOpenApiRoutes";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const podcastId = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const episodeId = "5e4d3c2b-1a09-4f8e-8d7c-6b5a4f3e2d1c";
const tvShowId = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f2a3b4c5d";
const trailerPath = `/episode/${podcastId}/${episodeId}/tvshow-trailer`;
const route = "/episode/:podcastId/:episodeId/tvshow-trailer";

function appWithCurate() {
	return appWithPermissions(route, "post", attachEpisodeAsTvShowTrailer, ["curate"]);
}

describe("attach episode as TV show trailer", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("POSTs Azure /episode/{podcastId}/{episodeId}/tvshow-trailer with tvShowId and title and returns 202", async () => {
		const outcome = { tvShowId, tvShowName: "Synthetic Show Title", failureIndexing: false };
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(outcome), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);
		const body = { tvShowId, title: "Synthetic Teaser" };

		const resp = await appWithCurate().request(
			trailerPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify(body) },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(outcome);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(String(url).endsWith(`/episode/${podcastId}/${episodeId}/tvshow-trailer`)).toBe(true);
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual(body);
	});

	it("forwards createShow, tvShowName and publisher to Azure and returns 202 with showCreated", async () => {
		const outcome = { tvShowId, tvShowName: "Synthetic Unreleased Show", failureIndexing: false, showCreated: true };
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(outcome), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);
		const body = { createShow: true, tvShowName: "Synthetic Unreleased Show", publisher: "Synthetic Network" };

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

	it("sends {} to Azure when the request has no body, so Azure reports the missing tvShowId", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "tvShowId is required" }), { status: 400 }));
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
		const app = appWithPermissions(route, "post", attachEpisodeAsTvShowTrailer, ["submit"]);

		const malformed = await app.request(
			trailerPath,
			{ method: "POST", headers: authJsonHeaders, body: "{not json" },
			testEnv()
		);
		const valid = await app.request(
			trailerPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ tvShowId }) },
			testEnv()
		);

		expect(malformed.status).toBe(403);
		expect(valid.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		[400, { error: "A removed TV show cannot take trailers" }],
		[404, { tvShowId, error: "TV show not found" }],
		[409, { tvShowId, error: "This episode is already a trailer of another TV show", failureIndexing: false }],
		[500, { tvShowId, error: "Unable to attach episode as a trailer", failureIndexing: true }]
	] as const)("passes Azure %s through", async (status, body) => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

		const resp = await appWithCurate().request(
			trailerPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ tvShowId }) },
			testEnv()
		);

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});
});

describe("attach episode as TV show trailer schemas", () => {
	it("accepts tvShowId, or createShow with tvShowName, and rejects both or neither", () => {
		expect(episodeTvShowTrailerAttachRequestSchema.safeParse({ tvShowId, title: "Synthetic Teaser" }).success).toBe(true);
		expect(episodeTvShowTrailerAttachRequestSchema.safeParse({
			createShow: true,
			tvShowName: "Synthetic Show",
			publisher: "Synthetic Network"
		}).success).toBe(true);
		expect(episodeTvShowTrailerAttachRequestSchema.safeParse({ createShow: true, tvShowId, tvShowName: "Synthetic Show" }).success).toBe(false);
		expect(episodeTvShowTrailerAttachRequestSchema.safeParse({ createShow: true, tvShowName: "  " }).success).toBe(false);
		expect(episodeTvShowTrailerAttachRequestSchema.safeParse({ title: "Synthetic Teaser" }).success).toBe(false);
		expect(episodeTvShowTrailerAttachRequestSchema.safeParse({ tvShowId: "not-a-guid" }).success).toBe(false);
	});

	it("parses the command outcome with showCreated and a 409 naming the claimed show", () => {
		expect(episodeTvShowTrailerAttachResponseSchema.parse({
			tvShowId,
			tvShowName: "Synthetic Show",
			failureIndexing: false,
			showCreated: true
		}).showCreated).toBe(true);
		expect(episodeTvShowTrailerAttachResponseSchema.safeParse({ tvShowId, error: "claimed" }).success).toBe(true);
	});
});

describe("attach episode as TV show trailer route registration", () => {
	it("registers openapi.post /episode/:podcastId/:episodeId/tvshow-trailer with documented schemas", () => {
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
					r.path === "/episode/:podcastId/:episodeId/tvshow-trailer" &&
					r.route === AttachEpisodeAsTvShowTrailerRoute
			)
		).toBe(true);

		type JsonContent = { content?: { "application/json"?: { schema?: unknown } } };
		const request = AttachEpisodeAsTvShowTrailerRoute.openApiSchema.request as
			| { body?: JsonContent }
			| undefined;
		const response202 = AttachEpisodeAsTvShowTrailerRoute.openApiSchema.responses?.[202] as
			| JsonContent
			| undefined;
		expect(request?.body?.content?.["application/json"]?.schema).toBe(
			episodeTvShowTrailerAttachRequestSchema
		);
		expect(response202?.content?.["application/json"]?.schema).toBe(
			episodeTvShowTrailerAttachResponseSchema
		);
	});
});
