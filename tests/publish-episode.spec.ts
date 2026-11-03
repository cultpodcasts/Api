import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import { publishEpisode, publishPodcastEpisode } from "../src/publish";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const podcastId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const episodeId = "b53e30bb-8afc-44a4-9b2c-d91168743fea";

describe("episode publish proxies", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
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
