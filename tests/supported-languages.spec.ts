import { afterEach, describe, expect, it, vi } from "vitest";
import * as supportedLanguageHandlers from "../src/supportedLanguages";
import {
	deleteSupportedLanguages,
	getNeutralCultures,
	getSupportedLanguages,
	postSupportedLanguages
} from "../src/supportedLanguages";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const azureList = { languages: [{ code: "en", name: "English" }] };

describe("supported-languages", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("does not export PUT handlers", () => {
		expect(Object.keys(supportedLanguageHandlers).filter((k) => /^put/i.test(k))).toEqual([]);
	});

	it("requires admin; curate is 403 and missing auth is 401", async () => {
		const unauth = appWithAuthPayload("/supported-languages", "get", getSupportedLanguages, null);
		const curate = appWithPermissions("/supported-languages", "get", getSupportedLanguages, ["curate"]);

		expect((await unauth.request("/supported-languages", { method: "GET" }, testEnv())).status).toBe(401);
		expect(
			(
				await curate.request("/supported-languages", { method: "GET", headers: authJsonHeaders }, testEnv())
			).status
		).toBe(403);
	});

	it("admin GET/POST/DELETE and cultures proxy to Azure with Cache-Control no-store", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(azureList), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const getApp = appWithPermissions("/supported-languages", "get", getSupportedLanguages, ["admin"]);
		const culturesApp = appWithPermissions(
			"/supported-languages/cultures",
			"get",
			getNeutralCultures,
			["admin"]
		);
		const postApp = appWithPermissions("/supported-languages", "post", postSupportedLanguages, ["admin"]);
		const deleteApp = appWithPermissions(
			"/supported-languages/:code",
			"delete",
			deleteSupportedLanguages,
			["admin"]
		);

		const env = testEnv();
		const responses = [
			await getApp.request("/supported-languages", { method: "GET", headers: authJsonHeaders }, env),
			await culturesApp.request(
				"/supported-languages/cultures",
				{ method: "GET", headers: authJsonHeaders },
				env
			),
			await postApp.request(
				"/supported-languages",
				{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ name: "French" }) },
				env
			),
			await deleteApp.request("/supported-languages/fr", { method: "DELETE", headers: authJsonHeaders }, env)
		];

		for (const resp of responses) {
			expect(resp.status).toBe(200);
			expect(resp.headers.get("Cache-Control")).toBe("no-store");
			expect(await resp.json()).toEqual(azureList);
		}
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});
});
