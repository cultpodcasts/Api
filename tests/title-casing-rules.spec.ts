import { afterEach, describe, expect, it, vi } from "vitest";
import * as titleCasingHandlers from "../src/titleCasingRules";
import {
	deleteTitleCasingRulesIgnoredSubject,
	deleteTitleCasingRulesKnownTerm,
	deleteTitleCasingRulesLowerCaseTerm,
	getTitleCasingRulesByLanguage,
	postTitleCasingRulesIgnoredSubject,
	postTitleCasingRulesKnownTerm,
	postTitleCasingRulesLowerCaseTerm
} from "../src/titleCasingRules";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const azureOk = { language: "en", lowerCaseTerms: ["a"] };

describe("title-casing-rules", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("does not export PUT handlers", () => {
		expect(Object.keys(titleCasingHandlers).filter((k) => /^put/i.test(k))).toEqual([]);
	});

	it("GET requires admin; curate is 403 and missing auth is 401", async () => {
		const unauth = appWithAuthPayload(
			"/title-casing-rules/:language",
			"get",
			getTitleCasingRulesByLanguage,
			null
		);
		const curate = appWithPermissions(
			"/title-casing-rules/:language",
			"get",
			getTitleCasingRulesByLanguage,
			["curate"]
		);

		expect(
			(await unauth.request("/title-casing-rules/en", { method: "GET" }, testEnv())).status
		).toBe(401);
		expect(
			(
				await curate.request("/title-casing-rules/en", { method: "GET", headers: authJsonHeaders }, testEnv())
			).status
		).toBe(403);
	});

	it("admin GET/POST/DELETE proxy to Azure with Cache-Control no-store", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(azureOk), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const getApp = appWithPermissions(
			"/title-casing-rules/:language",
			"get",
			getTitleCasingRulesByLanguage,
			["admin"]
		);
		const postLower = appWithPermissions(
			"/title-casing-rules/:language/lower-case-terms",
			"post",
			postTitleCasingRulesLowerCaseTerm,
			["admin"]
		);
		const deleteLower = appWithPermissions(
			"/title-casing-rules/:language/lower-case-terms/:term",
			"delete",
			deleteTitleCasingRulesLowerCaseTerm,
			["admin"]
		);
		const postKnown = appWithPermissions(
			"/title-casing-rules/:language/known-terms",
			"post",
			postTitleCasingRulesKnownTerm,
			["admin"]
		);
		const deleteKnown = appWithPermissions(
			"/title-casing-rules/:language/known-terms/:literal",
			"delete",
			deleteTitleCasingRulesKnownTerm,
			["admin"]
		);
		const postIgnored = appWithPermissions(
			"/title-casing-rules/:language/ignored-subjects",
			"post",
			postTitleCasingRulesIgnoredSubject,
			["admin"]
		);
		const deleteIgnored = appWithPermissions(
			"/title-casing-rules/:language/ignored-subjects/:term",
			"delete",
			deleteTitleCasingRulesIgnoredSubject,
			["admin"]
		);

		const env = testEnv();
		const responses = [
			await getApp.request("/title-casing-rules/en", { method: "GET", headers: authJsonHeaders }, env),
			await postLower.request(
				"/title-casing-rules/en/lower-case-terms",
				{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ term: "the" }) },
				env
			),
			await deleteLower.request(
				"/title-casing-rules/en/lower-case-terms/the",
				{ method: "DELETE", headers: authJsonHeaders },
				env
			),
			await postKnown.request(
				"/title-casing-rules/en/known-terms",
				{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ literal: "AI", display: "AI" }) },
				env
			),
			await deleteKnown.request(
				"/title-casing-rules/en/known-terms/AI",
				{ method: "DELETE", headers: authJsonHeaders },
				env
			),
			await postIgnored.request(
				"/title-casing-rules/fr/ignored-subjects",
				{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ term: "Paris" }) },
				env
			),
			await deleteIgnored.request(
				"/title-casing-rules/fr/ignored-subjects/Paris",
				{ method: "DELETE", headers: authJsonHeaders },
				env
			)
		];

		for (const resp of responses) {
			expect(resp.status).toBe(200);
			expect(resp.headers.get("Cache-Control")).toBe("no-store");
			expect(await resp.json()).toEqual(azureOk);
		}
		expect(fetchMock).toHaveBeenCalledTimes(7);
	});
});
