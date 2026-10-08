import { afterEach, describe, expect, it, vi } from "vitest";
import * as titleCasingHandlers from "../src/titleCasingRules";
import {
	deleteTitleCasingRulesIgnoredSubject,
	deleteTitleCasingRulesKnownTerm,
	deleteTitleCasingRulesLowerCaseTerm,
	getTitleCasingRulesByLanguage,
	postTitleCasingRulesIgnoredSubject,
	putTitleCasingRulesKnownTerm,
	postTitleCasingRulesLowerCaseTerm
} from "../src/titleCasingRules";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const azureOk = { language: "en", lowerCaseTerms: ["a"] };

describe("title-casing-rules", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("exports a PUT handler for known terms", () => {
		expect(Object.keys(titleCasingHandlers).filter((k) => /^put/i.test(k))).toEqual([
			"putTitleCasingRulesKnownTerm"
		]);
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
		const putKnown = appWithPermissions(
			"/title-casing-rules/:language/known-terms/:literal",
			"put",
			putTitleCasingRulesKnownTerm,
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
		const getResp = await getApp.request("/title-casing-rules/en", { method: "GET", headers: authJsonHeaders }, env);
		const commands = [
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
			await putKnown.request(
				"/title-casing-rules/en/known-terms/AI",
				{ method: "PUT", headers: authJsonHeaders, body: JSON.stringify({ pattern: "AI", options: null }) },
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

		expect(getResp.status).toBe(200);
		expect(getResp.headers.get("Cache-Control")).toBe("no-store");
		expect(await getResp.json()).toEqual(azureOk);
		for (const resp of commands) {
			expect(resp.status).toBe(202);
			expect(resp.headers.get("Cache-Control")).toBe("no-store");
			expect(await resp.text()).toBe("");
		}
		expect(fetchMock).toHaveBeenCalledTimes(7);
		const knownPut = fetchMock.mock.calls.find((call) => {
			const url = String(call[0]);
			const init = call[1] as { body?: string } | undefined;
			return url.includes("/known-terms/AI") && init?.body != null;
		});
		expect(knownPut).toBeTruthy();
		const knownUrl = String(knownPut![0]);
		const knownInit = knownPut![1] as { method?: string; body?: string };
		expect(knownInit.method).toBe("PUT");
		expect(knownUrl).toMatch(/\/title-casing-rules\/en\/known-terms\/AI$/);
		const knownBody = JSON.parse(knownInit.body ?? "");
		expect(knownBody).toEqual({ pattern: "AI", options: null });
		expect(knownBody).not.toHaveProperty("literal");
	});

	it("POST lower-case term forwards Azure 400", async () => {
		const payload = { error: "Term is required" };
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), { status: 400 })));
		const app = appWithPermissions(
			"/title-casing-rules/:language/lower-case-terms",
			"post",
			postTitleCasingRulesLowerCaseTerm,
			["admin"]
		);
		const resp = await app.request(
			"/title-casing-rules/en/lower-case-terms",
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ term: "the" }) },
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual(payload);
	});
});
