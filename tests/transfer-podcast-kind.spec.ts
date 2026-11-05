import { afterEach, describe, expect, it, vi } from "vitest";
import { transferPodcastKind } from "../src/transferPodcastKind";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const podcastId = "550e8400-e29b-41d4-a716-446655440000";
const kindPath = `/podcast/${podcastId}/kind`;

function podcastKindEnv() {
	return testEnv();
}

function appWithCurate() {
	return appWithPermissions("/podcast/:id/kind", "post", transferPodcastKind, ["curate"]);
}

describe("transfer podcast kind", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("POSTs Azure /{encodeURIComponent(id)}/kind and returns 202 enqueue outcome", async () => {
		const enqueueBody = {
			status: "Queued",
			parentId: podcastId,
			targetKind: "TvShow",
			enqueuedUtc: "2026-11-05T05:00:00.000Z",
			statusPath: `podcast/${podcastId}/kind`
		};
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(enqueueBody), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithCurate();

		const resp = await app.request(
			kindPath,
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ targetKind: "TvShow" })
			},
			podcastKindEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(enqueueBody);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(String(url).endsWith(`/${encodeURIComponent(podcastId)}/kind`)).toBe(true);
		expect(init.method).toBe("POST");
	});

	it("returns 403 without curate", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/podcast/:id/kind", "post", transferPodcastKind, ["submit"]);

		const resp = await app.request(
			kindPath,
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ targetKind: "NewsOrganisation" })
			},
			podcastKindEnv()
		);

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		[400, { error: "targetKind must be TvShow or NewsOrganisation" }],
		[404, { error: "Not found" }],
		[
			409,
			{
				status: "AlreadyRunning",
				parentId: podcastId,
				targetKind: "TvShow",
				statusPath: `podcast/${podcastId}/kind`
			}
		]
	] as const)("passthrough Azure %s", async (status, body) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(body), { status }))
		);
		const app = appWithCurate();

		const resp = await app.request(
			kindPath,
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ targetKind: "TvShow" })
			},
			podcastKindEnv()
		);

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});
});
