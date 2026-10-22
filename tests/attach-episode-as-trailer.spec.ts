import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachEpisodeAsTrailer } from "../src/attachEpisodeAsTrailer";
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
		const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
		const routes = readFileSync(resolve(process.cwd(), "src/openapiRoutes.ts"), "utf8");
		expect(index).toContain("openapi.post('/episode/:podcastId/:episodeId/trailer', AttachEpisodeAsTrailerRoute)");
		expect(routes).toContain("jsonBody(episodeTrailerAttachRequestSchema)");
		expect(routes).toContain("contentJson(episodeTrailerAttachResponseSchema)");
	});
});
