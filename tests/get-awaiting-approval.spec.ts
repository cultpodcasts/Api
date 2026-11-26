import { afterEach, describe, expect, it, vi } from "vitest";
import { getAwaitingApproval } from "../src/getAwaitingApproval";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const awaitingApprovalPath = "/episodes/awaiting-approval";

function listApp(permissions: string[] = ["curate"]) {
	return appWithPermissions(awaitingApprovalPath, "get", getAwaitingApproval, permissions);
}

describe("GET episodes awaiting approval", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("GETs Azure /api/episodes/awaiting-approval and relays the 200 body without max-age=600", async () => {
		const listBody = [
			{ id: "550e8400-e29b-41d4-a716-446655440000", podcastName: "A show", removed: true },
			{ id: "550e8400-e29b-41d4-a716-446655440001", podcastName: "Another show", removed: false }
		];
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(listBody), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = listApp();

		const resp = await app.request(awaitingApprovalPath, { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(listBody);
		expect(resp.headers.get("Cache-Control")).not.toBe("max-age=600");
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(String(url).endsWith("/api/episodes/awaiting-approval")).toBe(true);
		expect(init.method).toBe("GET");
	});

	it("returns 403 without curate and does not call Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = listApp(["submit"]);

		const resp = await app.request(awaitingApprovalPath, { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not report an Azure 500 as success", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }))
		);
		const app = listApp();

		const resp = await app.request(awaitingApprovalPath, { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(500);
		expect(resp.headers.get("Cache-Control")).not.toBe("max-age=600");
	});

	it("does not forward an Azure 400, because the list takes no parameters to validate", async () => {
		const upstreamBody = { error: "unexpected upstream detail" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(upstreamBody), { status: 400 }))
		);
		const app = listApp();

		const resp = await app.request(awaitingApprovalPath, { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(500);
		expect(await resp.json()).not.toEqual(upstreamBody);
	});
});
