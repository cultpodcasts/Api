import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogueIdentityLookup } from "../src/catalogueIdentityLookup";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

describe("POST /catalogue/identity/lookup", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("forwards a 200 matched body to Azure with curate", async () => {
		const payload = {
			status: "Matched",
			ids: { imdbId: "tt0000001", tmdbId: 42, tvdbId: null }
		};
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/catalogue/identity/lookup", "post", catalogueIdentityLookup, ["curate"]);
		const resp = await app.request(
			"/catalogue/identity/lookup",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ kind: "Film", title: "Synthetic Title", year: 2020 })
			},
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(payload);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
		expect(String(url)).toContain("/api/catalogue/identity/lookup");
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual({
			kind: "Film",
			title: "Synthetic Title",
			year: 2020
		});
	});

	it("forwards Azure 400", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ error: "bad" }), { status: 400 }))
		);
		const app = appWithPermissions("/catalogue/identity/lookup", "post", catalogueIdentityLookup, ["curate"]);
		const resp = await app.request(
			"/catalogue/identity/lookup",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ kind: "Film", title: "x" })
			},
			testEnv()
		);
		expect(resp.status).toBe(400);
	});

	it("returns 403 without curate and does not call Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/catalogue/identity/lookup", "post", catalogueIdentityLookup, []);
		const resp = await app.request(
			"/catalogue/identity/lookup",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ kind: "Film", title: "x" })
			},
			testEnv()
		);
		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
