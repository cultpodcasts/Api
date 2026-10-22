import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { moveEpisodeToTvShow } from "../src/moveEpisodeToTvShow";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const podcastId = "7d1b9c40-2f6e-4a8b-9c3d-1e2f3a4b5c6d";
const episodeId = "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d";
const tvShowPath = `/episode/${podcastId}/${episodeId}/tvshow`;
const route = "/episode/:podcastId/:episodeId/tvshow";

function appWithCurate() {
	return appWithPermissions(route, "post", moveEpisodeToTvShow, ["curate"]);
}

describe("move episode to TV show", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("POSTs Azure /episode/{podcastId}/{episodeId}/tvshow with the target and returns 202", async () => {
		const outcome = { tvShowId: podcastId, tvShowName: "Synthetic Show", episodeId, createdShow: true, failureIndexing: false };
		const request = { tvShowName: "Synthetic Show", createShow: true, publisher: "Synthetic Publisher", title: "Synthetic Episode" };
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(outcome), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await appWithCurate().request(
			tvShowPath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify(request) },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(outcome);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(String(url).endsWith(`/episode/${podcastId}/${episodeId}/tvshow`)).toBe(true);
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual(request);
	});

	it("sends {} to Azure when the request has no body", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ episodeId }), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await appWithCurate().request(
			tvShowPath,
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
			tvShowPath,
			{ method: "POST", headers: authJsonHeaders, body: "{not json" },
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 403, not 400, for a malformed body without curate", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "post", moveEpisodeToTvShow, ["submit"]);

		const resp = await app.request(
			tvShowPath,
			{ method: "POST", headers: authJsonHeaders, body: "{not json" },
			testEnv()
		);

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 403 without curate", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "post", moveEpisodeToTvShow, ["submit"]);

		const resp = await app.request(
			tvShowPath,
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		[400, { error: "Send exactly one of tvShowId or tvShowName" }],
		[404, { podcastId, episodeId, error: "TV show not found" }],
		[409, { tvShowId: podcastId, tvShowName: "Synthetic Show", episodeId, createdShow: false, error: "Several TV shows have this name", failureIndexing: false }],
		[500, { error: "Unable to move episode to TV show" }]
	] as const)("passes Azure %s through", async (status, body) => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

		const resp = await appWithCurate().request(
			tvShowPath,
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});
});

describe("move episode to TV show route registration", () => {
	it("registers openapi.post /episode/:podcastId/:episodeId/tvshow with documented schemas", () => {
		const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
		const routes = readFileSync(resolve(process.cwd(), "src/openapiRoutes.ts"), "utf8");
		expect(index).toContain("openapi.post('/episode/:podcastId/:episodeId/tvshow', MoveEpisodeToTvShowRoute)");
		expect(routes).toContain("jsonBody(episodeTvShowMoveRequestSchema)");
		expect(routes).toContain("contentJson(episodeTvShowMoveResponseSchema)");
	});
});
