import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getNewsOrganisation } from "../src/getNewsOrganisation";
import { getNewsReport } from "../src/getNewsReport";
import {
	ambiguousCatalogueNameConflict,
	ambiguousNewsOrganisationNameConflict
} from "../src/openapiRouteFactory";
import { updateNewsOrganisation } from "../src/updateNewsOrganisation";
import { updateNewsReport } from "../src/updateNewsReport";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

// Synthetic ids and names only.
const id = "550e8400-e29b-41d4-a716-446655440000";
const orgName = "Synthetic News Org";
const ambiguousIds = [
	"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
];

const getRoutes = [
	["/newsorganisation/:identifier", `/newsorganisation/${id}`, getNewsOrganisation, "/api/newsorganisation/"],
	["/newsreport/:id", `/newsreport/${id}`, getNewsReport, "/api/newsreport/"]
] as const;

const patchRoutes = [
	["/newsorganisation/:id", `/newsorganisation/${id}`, updateNewsOrganisation, "/api/newsorganisation/", { searchTerms: "", language: "fr" }],
	["/newsreport/:id", `/newsreport/${id}`, updateNewsReport, "/api/newsreport/", { release: "2026-10-03", subjects: ["Synthetic Subject"] }]
] as const;

function stubFetch(status: number, body: unknown) {
	const fetchMock = vi.fn(
		async (_url: URL | string, _init?: RequestInit) =>
			new Response(body === null ? null : JSON.stringify(body), { status })
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("news curation Azure proxies", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each(getRoutes)("GET %s returns 403 without curate and does not call Azure", async (route, path, handler) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "get", handler, ["submit"]);
		const resp = await app.request(path, { method: "GET", headers: authJsonHeaders }, testEnv());
		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(patchRoutes)("PATCH %s returns 403 without curate and does not call Azure", async (route, path, handler, _p, body) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "patch", handler, ["submit"]);
		const resp = await app.request(
			path,
			{ method: "PATCH", headers: authJsonHeaders, body: JSON.stringify(body) },
			testEnv()
		);
		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(getRoutes)("GET %s returns 401 without a token payload and does not call Azure", async (route, path, handler) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload(route, "get", handler, null);
		const resp = await app.request(path, { method: "GET" }, testEnv());
		expect(resp.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(getRoutes)("GET %s forwards the curator bearer token to Azure %s{id}", async (route, path, handler, azurePrefix) => {
		const fetchMock = stubFetch(200, { id });
		const app = appWithPermissions(route, "get", handler, ["curate"]);
		await app.request(path, { method: "GET", headers: authJsonHeaders }, testEnv());
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe(`https://functions.example${azurePrefix}${encodeURIComponent(id)}`);
		expect(init?.method).toBe("GET");
		expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
	});

	it("GET /newsorganisation/:identifier passes 200, 401, 404, 409 (ambiguous ids) and 500 bodies through", async () => {
		const app = appWithPermissions("/newsorganisation/:identifier", "get", getNewsOrganisation, ["curate"]);
		for (const [status, body] of [
			[200, { id, name: orgName, removed: false, twitterHandle: "" }],
			[401, { Message: "Unauthorised" }],
			[404, { error: "Unable to retrieve news organisation" }],
			[409, ambiguousIds],
			[500, { error: "Unable to retrieve news organisation" }]
		] as const) {
			stubFetch(status, body);
			const resp = await app.request(`/newsorganisation/${id}`, { method: "GET", headers: authJsonHeaders }, testEnv());
			expect(resp.status).toBe(status);
			expect(await resp.json()).toEqual(body);
			vi.unstubAllGlobals();
		}
	});

	it("GET /newsorganisation/:identifier encodes a route-form name into the Azure path", async () => {
		const fetchMock = stubFetch(409, ambiguousIds);
		const app = appWithPermissions("/newsorganisation/:identifier", "get", getNewsOrganisation, ["curate"]);
		const resp = await app.request(
			`/newsorganisation/${encodeURIComponent(orgName)}`,
			{ method: "GET", headers: authJsonHeaders },
			testEnv()
		);
		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(ambiguousIds);
		const [url] = fetchMock.mock.calls[0];
		expect(String(url)).toBe(`https://functions.example/api/newsorganisation/${encodeURIComponent(orgName)}`);
	});

	it("GET /newsreport/:id passes 200, 401, 404 and 500 through and maps an unexpected 409 to 500", async () => {
		const app = appWithPermissions("/newsreport/:id", "get", getNewsReport, ["curate"]);
		for (const [status, body] of [
			[200, { id, newsOrganisationId: id, title: "Synthetic report", release: "2026-10-03", duration: "0:06:30" }],
			[401, { Message: "Unauthorised" }],
			[404, { error: "Unable to retrieve news report" }],
			[500, { error: "Unable to retrieve news report" }]
		] as const) {
			stubFetch(status, body);
			const resp = await app.request(`/newsreport/${id}`, { method: "GET", headers: authJsonHeaders }, testEnv());
			expect(resp.status).toBe(status);
			expect(await resp.json()).toEqual(body);
			vi.unstubAllGlobals();
		}
		stubFetch(409, ambiguousIds);
		const clash = await app.request(`/newsreport/${id}`, { method: "GET", headers: authJsonHeaders }, testEnv());
		expect(clash.status).toBe(500);
	});

	it.each(patchRoutes)(
		"PATCH %s returns 202, forwards the token and body to Azure %s{id}",
		async (route, path, handler, azurePrefix, body) => {
			const fetchMock = stubFetch(202, null);
			const app = appWithPermissions(route, "patch", handler, ["curate"]);
			const resp = await app.request(
				path,
				{ method: "PATCH", headers: authJsonHeaders, body: JSON.stringify(body) },
				testEnv()
			);
			expect(resp.status).toBe(202);
			const [url, init] = fetchMock.mock.calls[0];
			expect(String(url)).toBe(`https://functions.example${azurePrefix}${encodeURIComponent(id)}`);
			expect(init?.method).toBe("PATCH");
			expect(JSON.parse(String(init?.body))).toEqual(body);
			expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
		}
	);

	it("PATCH /newsorganisation/:id acknowledges with an empty 202 while PATCH /newsreport/:id passes the episode-style outcome through", async () => {
		const outcome = { tweetDeleted: true, blueskyPostDeleted: null, searchIndexerState: null };
		const [orgRoute, orgPath, orgHandler] = patchRoutes[0];
		const [reportRoute, reportPath, reportHandler] = patchRoutes[1];
		stubFetch(202, outcome);
		const org = await appWithPermissions(orgRoute, "patch", orgHandler, ["curate"]).request(
			orgPath,
			{ method: "PATCH", headers: authJsonHeaders, body: JSON.stringify({ removed: true }) },
			testEnv()
		);
		expect(org.status).toBe(202);
		expect(await org.text()).toBe("");
		vi.unstubAllGlobals();
		stubFetch(202, outcome);
		const report = await appWithPermissions(reportRoute, "patch", reportHandler, ["curate"]).request(
			reportPath,
			{ method: "PATCH", headers: authJsonHeaders, body: JSON.stringify({ tweeted: false, unBluesky: true, posted: true }) },
			testEnv()
		);
		expect(report.status).toBe(202);
		expect(await report.json()).toEqual(outcome);
	});

	it.each(patchRoutes)("PATCH %s passes 400, 401, 404 and 500 bodies through", async (route, path, handler, _p, body) => {
		const app = appWithPermissions(route, "patch", handler, ["curate"]);
		for (const [status, upstream] of [
			[400, { message: "Invalid release '2026-10-03T10:00': expected a calendar date yyyy-MM-dd." }],
			[401, { Message: "Unauthorised" }],
			[404, { id }],
			[500, { error: "Unable to update" }]
		] as const) {
			stubFetch(status, upstream);
			const resp = await app.request(
				path,
				{ method: "PATCH", headers: authJsonHeaders, body: JSON.stringify(body) },
				testEnv()
			);
			expect(resp.status).toBe(status);
			expect(await resp.json()).toEqual(upstream);
			vi.unstubAllGlobals();
		}
	});

	it.each(patchRoutes)("PATCH %s does not forward a resource-returning 200 (only 202 acknowledges)", async (route, path, handler, _p, body) => {
		// Only 202 is the acknowledgement; a resource-returning 200 is a CQRS breach and is not forwarded.
		stubFetch(200, { id });
		const app = appWithPermissions(route, "patch", handler, ["curate"]);
		const resp = await app.request(
			path,
			{ method: "PATCH", headers: authJsonHeaders, body: JSON.stringify(body) },
			testEnv()
		);
		expect(resp.status).toBe(500);
	});
});

describe("news curation OpenAPI contracts", () => {
	const src = readFileSync(resolve(process.cwd(), "src/openapiRoutes.ts"), "utf8");
	const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
	const block = (start: string, end: string) => src.slice(src.indexOf(start), src.indexOf(end));

	it("registers GET/PATCH /newsorganisation and /newsreport", () => {
		expect(index).toContain("openapi.get('/newsorganisation/:identifier', GetNewsOrganisationRoute);");
		expect(index).toContain("openapi.patch('/newsorganisation/:id', UpdateNewsOrganisationRoute);");
		expect(index).toContain("openapi.get('/newsreport/:id', GetNewsReportRoute);");
		expect(index).toContain("openapi.patch('/newsreport/:id', UpdateNewsReportRoute);");
	});

	it("uses a news-specific 409 only on GET news organisation, curate auth, an empty org 202 and an outcome report 202", () => {
		expect(ambiguousNewsOrganisationNameConflict).not.toBe(ambiguousCatalogueNameConflict);
		expect(ambiguousNewsOrganisationNameConflict.description).toMatch(/news organisation/i);
		const getOrg = block("export const GetNewsOrganisationRoute", "export const UpdateNewsOrganisationRoute");
		const patchOrg = block("export const UpdateNewsOrganisationRoute", "export const GetNewsReportRoute");
		const getReport = block("export const GetNewsReportRoute", "export const UpdateNewsReportRoute");
		const patchReport = block("export const UpdateNewsReportRoute", "export const HomepageRoute");
		expect(getOrg).toContain("409: ambiguousNewsOrganisationNameConflict");
		expect(getReport).not.toContain("409:");
		for (const b of [getOrg, patchOrg, getReport, patchReport]) {
			expect(b).toContain("auth: curateAuth");
		}
		expect(patchOrg).toContain("jsonBody(newsOrganisationChangeRequestSchema)");
		expect(patchReport).toContain("jsonBody(newsReportChangeRequestSchema)");
		expect(patchOrg).toMatch(/202: \{ description: "News organisation updated \(empty body\)" \}/);
		expect(patchReport).toContain('202: { description: "News report updated; social-retraction outcome", ...contentJson(episodeUpdateResponseSchema) }');
	});
});
