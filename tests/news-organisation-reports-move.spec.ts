import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import worker from "../src/index";
import { moveNewsOrganisationReports } from "../src/moveNewsOrganisationReports";
import { MoveNewsOrganisationReportsRoute } from "../src/openapiRoutes";
import { newsReportOrganisationMoveRequestSchema, newsReportOrganisationMoveResponseSchema } from "../src/openapiSchemas";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";
import { testEnv as auth0TestEnv } from "./support/honoRoute";

const sourceId = "3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c";
const targetId = "6c5d4e3f-2a1b-4c0d-9e8f-7a6b5c4d3e2f";
const reportId = "9e8f7a6b-5c4d-4e3f-8a1b-0c9d8e7f6a5b";
const movePath = `/newsorganisation/${sourceId}/reports/move`;
const route = "/newsorganisation/:id/reports/move";

type JsonContent = { description?: string; content?: { "application/json"?: { schema?: unknown } } };

function curateApp() {
	return appWithPermissions(route, "post", moveNewsOrganisationReports, ["curate"]);
}

describe("move news organisation reports proxy", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("POSTs the body to the Azure route with the curator token and returns the 202 outcome", async () => {
		const accepted = {
			sourceNewsOrganisationId: sourceId,
			targetNewsOrganisationId: targetId,
			targetNewsOrganisationName: "Synthetic Target",
			movedReportIds: [reportId],
			remainingReportCount: 0,
			emptiedNewsOrganisationId: sourceId,
			movedYouTubeChannelIds: ["UCsyntheticchannel000000"],
			youTubeChannelMoveFailed: false,
			failureIndexing: false
		};
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(accepted), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);
		const request = { targetNewsOrganisationId: targetId, reportIds: [reportId], moveYouTubeChannels: true };

		const resp = await curateApp().request(
			movePath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify(request) },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(accepted);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as unknown as [URL | string, RequestInit];
		expect(String(url).endsWith(`/api/newsorganisation/${sourceId}/reports/move`)).toBe(true);
		expect(init.method).toBe("POST");
		expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-token");
		expect(JSON.parse(String(init.body))).toEqual(request);
	});

	it("forwards an explicit empty reportIds to Azure untouched and passes its 400 error body through", async () => {
		const refused = { error: "reportIds cannot be empty. Omit it to move the source's next reports" };
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(refused), { status: 400 }));
		vi.stubGlobal("fetch", fetchMock);
		const request = { targetNewsOrganisationId: targetId, reportIds: [] };

		const resp = await curateApp().request(
			movePath,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify(request) },
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual(refused);
		const [, init] = fetchMock.mock.calls[0] as unknown as [URL | string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual(request);
	});

	it("returns 400 for a malformed body without calling Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const resp = await curateApp().request(movePath, { method: "POST", headers: authJsonHeaders, body: "{not json" }, testEnv());

		expect(resp.status).toBe(400);
		expect(((await resp.json()) as { error: string }).error).toContain("targetNewsOrganisationId");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 403 without curate and does not call Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "post", moveNewsOrganisationReports, ["submit"]);

		const resp = await app.request(movePath, { method: "POST", headers: authJsonHeaders, body: "{}" }, testEnv());

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 401 without a token payload and does not call Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload(route, "post", moveNewsOrganisationReports, null);

		const resp = await app.request(movePath, { method: "POST", body: "{}" }, testEnv());

		expect(resp.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		[404, { notFoundReportIds: [reportId], error: "Some report ids were not found" }],
		[409, { conflictReportIds: [reportId], error: "Some report ids belong elsewhere" }],
		[409, { movedReportIds: [], error: "One of the news organisations is being indexed. Nothing was moved; retry in a few minutes", retryable: true }],
		[500, { movedReportIds: [reportId], error: "1 of 2 reports moved; 1 source row(s) could not be deleted", failureIndexing: false }]
	] as const)("passes Azure %s through", async (status, body) => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

		const resp = await curateApp().request(movePath, { method: "POST", headers: authJsonHeaders, body: "{}" }, testEnv());

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});
});

describe("move news organisation reports OpenAPI contract", () => {
	it("documents the move body, 202 outcome, refusals and curate auth", () => {
		const schema = MoveNewsOrganisationReportsRoute.openApiSchema;
		const request = schema.request as { body?: JsonContent } | undefined;
		expect(request?.body?.content?.["application/json"]?.schema).toBe(newsReportOrganisationMoveRequestSchema);
		const accepted = schema.responses?.[202] as JsonContent | undefined;
		expect(accepted?.content?.["application/json"]?.schema).toBe(newsReportOrganisationMoveResponseSchema);
		for (const status of [400, 401, 403, 404, 409, 500]) {
			expect(schema.responses?.[status]).toBeDefined();
		}
		expect(schema.responses?.[403]?.description).toMatch(/curate/);
		expect(schema.responses?.[403]?.description).not.toMatch(/admin/);
		expect(schema.responses?.[409]?.description).toMatch(/retryable: true/);
		expect(newsReportOrganisationMoveResponseSchema.parse({ retryable: true }).retryable).toBe(true);
		expect(schema.responses?.[500]?.description).toMatch(/not yet moved/);
		expect(MoveNewsOrganisationReportsRoute.requiresAuth).toBe(true);
	});

	it("validates the move request: a guid target, 1-500 report ids, ids optional or null", () => {
		expect(newsReportOrganisationMoveRequestSchema.parse({ targetNewsOrganisationId: targetId }).reportIds).toBeUndefined();
		expect(newsReportOrganisationMoveRequestSchema.parse({ targetNewsOrganisationId: targetId, reportIds: null }).reportIds).toBeNull();
		expect(() => newsReportOrganisationMoveRequestSchema.parse({ targetNewsOrganisationId: "not-a-guid" })).toThrow();
		expect(() => newsReportOrganisationMoveRequestSchema.parse({ targetNewsOrganisationId: targetId, reportIds: [] })).toThrow();
		const tooMany = Array.from({ length: 501 }, () => reportId);
		expect(() => newsReportOrganisationMoveRequestSchema.parse({ targetNewsOrganisationId: targetId, reportIds: tooMany })).toThrow();
	});
});

describe("move news organisation reports on the Worker app", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("routes POST behind auth (401 without a token, not 404) and does not call Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const resp = await worker.fetch(
			new Request(`https://api.example${movePath}`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }),
			auth0TestEnv(),
			{} as ExecutionContext
		);
		expect(resp.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});