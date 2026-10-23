import { afterEach, describe, expect, it, vi } from "vitest";
import { banDiscoveryChannel } from "../src/banDiscoveryChannel";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

describe("discovery channel ban proxy", () => {
	const resultId = "b6f1c2d4-0000-4000-8000-000000000001";

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns an empty 202 and posts the ban to Azure", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "Accepted" }), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/discovery-curation/:resultId/ban", "post", banDiscoveryChannel, ["curate"]);

		const resp = await app.request(
			`/discovery-curation/${resultId}/ban`,
			{ method: "POST", headers: authJsonHeaders },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.text()).toBe("");
		expect(fetchMock).toHaveBeenCalledOnce();
		const called = String(fetchMock.mock.calls[0][0]);
		expect(called).toBe(`https://functions.example/api/DiscoveryCuration/${resultId}/ban`);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(init.method).toBe("POST");
	});

	it("forwards Azure 409 without treating it as a Worker error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ error: "A news organisation or TV show already owns this channel." }), { status: 409 }))
		);
		const app = appWithPermissions("/discovery-curation/:resultId/ban", "post", banDiscoveryChannel, ["curate"]);

		const resp = await app.request(
			`/discovery-curation/${resultId}/ban`,
			{ method: "POST", headers: authJsonHeaders },
			testEnv()
		);

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual({ error: "A news organisation or TV show already owns this channel." });
	});
});
