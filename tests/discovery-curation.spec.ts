import { afterEach, describe, expect, it, vi } from "vitest";
import { getDiscoveryReports } from "../src/getDiscoveryReports";
import { submitDiscovery } from "../src/submitDiscovery";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

describe("discovery-curation status forwarding", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("submitDiscovery returns Azure 409 instead of Worker 500", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ error: "conflict" }), { status: 409 }))
		);
		const app = appWithPermissions("/discovery-curation", "post", submitDiscovery, ["curate"]);

		const resp = await app.request(
			"/discovery-curation",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ ids: [], resultIds: [] })
			},
			testEnv()
		);

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual({ error: "conflict" });
	});

	it("getDiscoveryReports returns Azure 404 instead of Worker 500", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ error: "missing" }), { status: 404 }))
		);
		const app = appWithPermissions("/discovery-curation", "get", getDiscoveryReports, ["curate"]);

		const resp = await app.request(
			"/discovery-curation",
			{ method: "GET", headers: authJsonHeaders },
			testEnv()
		);

		expect(resp.status).toBe(404);
		expect(await resp.json()).toEqual({ error: "missing" });
	});
});
