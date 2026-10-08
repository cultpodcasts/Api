import { afterEach, describe, expect, it, vi } from "vitest";
import { updatePodcastEpisode } from "../src/updateEpisode";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const podcastId = "550e8400-e29b-41d4-a716-446655440000";
const episodeId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const route = "/episode/:podcastId/:episodeId";
const requestPath = `/episode/${podcastId}/${episodeId}`;

function episodeEnv() {
	return testEnv();
}

describe("PATCH /episode/:podcastId/:episodeId", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("forwards Azure 500 body instead of collapsing to { error: Error }", async () => {
		const azureBody = { error: "Unable to update episode" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(azureBody), { status: 500 }))
		);
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(azureBody), { status: 500 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "patch", updatePodcastEpisode, ["curate"]);

		const resp = await app.request(
			requestPath,
			{
				method: "PATCH",
				headers: authJsonHeaders,
				body: JSON.stringify({ guests: ["Guest Name"] })
			},
			episodeEnv()
		);

		expect(resp.status).toBe(500);
		const init = fetchMock.mock.calls[0][1] as { method?: string };
		expect(init.method).toBe("PATCH");
		expect(await resp.json()).toEqual(azureBody);
	});

	it("returns 202 from Azure success", async () => {
		const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "patch", updatePodcastEpisode, ["curate"]);

		const resp = await app.request(
			requestPath,
			{
				method: "PATCH",
				headers: authJsonHeaders,
				body: JSON.stringify({ guests: ["Guest Name"] })
			},
			episodeEnv()
		);

		expect(resp.status).toBe(202);
		const init = fetchMock.mock.calls[0][1] as { method?: string };
		expect(init.method).toBe("PATCH");
	});
});
