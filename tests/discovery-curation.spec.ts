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

	it("submitDiscovery passes Azure 202 held response through for a supervised curator", async () => {
		const held = { submissionId: "550e8400-e29b-41d4-a716-446655440000", status: "Pending" };
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(held), { status: 202 })));
		const app = appWithPermissions("/discovery-curation", "post", submitDiscovery, ["curate", "curate:supervised"]);

		const resp = await app.request(
			"/discovery-curation",
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ ids: [], resultIds: [] }) },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(held);
	});

	it("submitDiscovery passes Azure 409 with unavailable documentIds through", async () => {
		const conflict = { message: "One or more reports are not available for curation.", documentIds: ["6ba7b810-9dad-11d1-80b4-00c04fd430c8"] };
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(conflict), { status: 409 })));
		const app = appWithPermissions("/discovery-curation", "post", submitDiscovery, ["curate", "curate:supervised"]);

		const resp = await app.request(
			"/discovery-curation",
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ ids: [], resultIds: [] }) },
			testEnv()
		);

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(conflict);
	});

	it("submitDiscovery denies curate:supervised without curate (supervised curators keep curate)", async () => {
		const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/discovery-curation", "post", submitDiscovery, ["curate:supervised"]);

		const resp = await app.request(
			"/discovery-curation",
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ ids: [], resultIds: [] }) },
			testEnv()
		);

		expect(resp.status).not.toBe(202);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
