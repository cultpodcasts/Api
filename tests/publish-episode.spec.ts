import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import worker from "../src/index";
import { PublishEpisodeRoute } from "../src/openapiRoutes";
import { publishEpisode, publishPodcastEpisode } from "../src/publish";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";
import { testEnv as auth0TestEnv } from "./support/honoRoute";

const podcastId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const episodeId = "b53e30bb-8afc-44a4-9b2c-d91168743fea";

describe("episode publish proxies", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("the Worker app routes POST /episode/publish/:episodeId behind curate auth (401 without a token, not 404)", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const resp = await worker.fetch(
			new Request(`https://api.example/episode/publish/${episodeId}`, {
				method: "POST",
				body: "{}",
				headers: { "Content-Type": "application/json" }
			}),
			auth0TestEnv(),
			{} as ExecutionContext
		);
		expect(resp.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(PublishEpisodeRoute.requiresAuth).toBe(true);
		expect(PublishEpisodeRoute.openApiSchema.security).toEqual([{ bearerAuth: [] }]);
		expect(PublishEpisodeRoute.openApiSchema.description).toMatch(/`curate`/);
		expect(PublishEpisodeRoute.openApiSchema.responses?.[403]?.description).toMatch(/without `curate`/);
		expect(PublishEpisodeRoute.openApiSchema.responses?.[404]).toBeUndefined();
	});

	it("POST /episode/publish/:episodeId proxies guid-only to Azure episode/publish/{id}", async () => {
		const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/episode/publish/:episodeId", "post", publishEpisode, ["curate"]);
		const resp = await app.request(
			`/episode/publish/${episodeId}`,
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ tweet: true, blueskyPost: true })
			},
			testEnv()
		);
		expect(resp.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledOnce();
		const calledUrl = String(fetchMock.mock.calls[0]![0]);
		expect(calledUrl).toContain(`/api/episode/publish/${encodeURIComponent(episodeId)}`);
		expect(calledUrl).not.toContain(`${podcastId}/`);
	});

	it("POST /episode/publish/:episodeId returns 403 without curate", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/episode/publish/:episodeId", "post", publishEpisode, ["submit"]);
		const resp = await app.request(
			`/episode/publish/${episodeId}`,
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ tweet: true })
			},
			testEnv()
		);
		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("POST /episode/publish/:podcastId/:episodeId still proxies the two-segment path", async () => {
		const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(
			"/episode/publish/:podcastId/:episodeId",
			"post",
			publishPodcastEpisode,
			["curate"]
		);
		const resp = await app.request(
			`/episode/publish/${podcastId}/${episodeId}`,
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ tweet: true })
			},
			testEnv()
		);
		expect(resp.status).toBe(200);
		const calledUrl = String(fetchMock.mock.calls[0]![0]);
		expect(calledUrl).toContain(
			`/api/episode/publish/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}`
		);
	});
});
