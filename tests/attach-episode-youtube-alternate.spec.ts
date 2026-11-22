import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachEpisodeYouTubeAlternate } from "../src/attachEpisodeYouTubeAlternate";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const podcastId = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const episodeId = "a4af375d-acef-469b-8d77-c8808a16f9b1";
const filmId = "925e2a11-668f-4dfa-a78d-57dd4de0051f";
const attachPath = `/episode/${podcastId}/${episodeId}/youtube-alternate`;
const route = "/episode/:podcastId/:episodeId/youtube-alternate";

function appWithCurate() {
	return appWithPermissions(route, "post", attachEpisodeYouTubeAlternate, ["curate"]);
}

describe("attach episode as an additional YouTube upload", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("POSTs Azure /episode/{podcastId}/{episodeId}/youtube-alternate with targetKind and targetId and returns 202", async () => {
		const outcome = { targetId: filmId, name: "Manic", failureIndexing: false };
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(outcome), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);
		const body = { targetKind: "Film", targetId: filmId };

		const resp = await appWithCurate().request(
			attachPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify(body) },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(outcome);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(String(url).endsWith(`/episode/${podcastId}/${episodeId}/youtube-alternate`)).toBe(true);
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual(body);
	});

	it("sends {} to Azure when the request has no body, so Azure reports the missing target", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "targetKind and targetId are required" }), { status: 400 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await appWithCurate().request(
			attachPath,
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
			attachPath,
			{ method: "POST", headers: authJsonHeaders, body: "{not json" },
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 403 without curate, whatever the body", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "post", attachEpisodeYouTubeAlternate, ["submit"]);

		const malformed = await app.request(
			attachPath,
			{ method: "POST", headers: authJsonHeaders, body: "{not json" },
			testEnv()
		);
		const valid = await app.request(
			attachPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ targetKind: "Film", targetId: filmId }) },
			testEnv()
		);

		expect(malformed.status).toBe(403);
		expect(valid.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		[400, { error: "A removed or held-for-approval episode cannot be attached" }],
		[404, { podcastId, episodeId, error: "Target not found" }],
		[409, { targetId: filmId, name: "Manic", error: "Film 'Manic' already has a different spotify link (https://open.spotify.com/episode/synthetic)." }],
		[500, { error: "Unable to attach episode as an additional YouTube upload" }]
	] as const)("passes Azure %s through", async (status, body) => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

		const resp = await appWithCurate().request(
			attachPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ targetKind: "Film", targetId: filmId }) },
			testEnv()
		);

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});
});

describe("attach episode as an additional YouTube upload route registration", () => {
	it("registers openapi.post /episode/:podcastId/:episodeId/youtube-alternate with documented schemas", () => {
		const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
		const routes = readFileSync(resolve(process.cwd(), "src/openapiRoutes.ts"), "utf8");
		expect(index).toContain("openapi.post('/episode/:podcastId/:episodeId/youtube-alternate', AttachEpisodeYouTubeAlternateRoute)");
		expect(routes).toContain("jsonBody(episodeYouTubeAlternateAttachRequestSchema)");
		expect(routes).toContain("contentJson(episodeYouTubeAlternateAttachResponseSchema)");
	});
});
