import { afterEach, describe, expect, it, vi } from "vitest";
import { getPodcastKindTransferStatus } from "../src/getPodcastKindTransferStatus";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const podcastId = "550e8400-e29b-41d4-a716-446655440000";
const kindPath = `/podcast/${podcastId}/kind`;

function statusApp(permissions: string[] = ["curate"]) {
	return appWithPermissions("/podcast/:id/kind", "get", getPodcastKindTransferStatus, permissions);
}

describe("GET podcast kind-transfer status", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("GETs Azure /{encodeURIComponent(id)}/kind and returns 200 without max-age=600", async () => {
		const jobBody = {
			status: "Running",
			parentId: podcastId,
			targetKind: "TvShow",
			startedUtc: "2026-11-05T05:01:00.000Z"
		};
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(jobBody), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = statusApp();

		const resp = await app.request(kindPath, { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(jobBody);
		expect(resp.headers.get("Cache-Control")).not.toBe("max-age=600");
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(String(url).endsWith(`/${encodeURIComponent(podcastId)}/kind`)).toBe(true);
		expect(init.method).toBe("GET");
	});

	it("forwards Azure 404", async () => {
		const body = { error: "Not found" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(body), { status: 404 }))
		);
		const app = statusApp();

		const resp = await app.request(kindPath, { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(404);
		expect(await resp.json()).toEqual(body);
		expect(resp.headers.get("Cache-Control")).not.toBe("max-age=600");
	});

	it("returns 403 without curate and does not call Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = statusApp(["submit"]);

		const resp = await app.request(kindPath, { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("encodes id with reserved characters in the Azure path", async () => {
		const rawId = "id/with spaces";
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "Idle" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/podcast/:id/kind", "get", getPodcastKindTransferStatus, ["curate"]);

		const resp = await app.request(
			`/podcast/${encodeURIComponent(rawId)}/kind`,
			{ method: "GET", headers: authJsonHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		const [url] = fetchMock.mock.calls[0] as [URL | string];
		expect(String(url).endsWith(`/${encodeURIComponent(rawId)}/kind`)).toBe(true);
	});
});
