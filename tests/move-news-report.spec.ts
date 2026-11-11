import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import worker from "../src/index";
import { moveNewsReportToFilm, moveNewsReportToTvShow } from "../src/moveNewsReport";
import { MoveNewsReportToFilmRoute, MoveNewsReportToTvShowRoute } from "../src/openapiRoutes";
import {
	episodeFilmMoveRequestSchema,
	episodeFilmMoveResponseSchema,
	episodeTvShowMoveRequestSchema,
	episodeTvShowMoveResponseSchema
} from "../src/openapiSchemas";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";
import { testEnv as auth0TestEnv } from "./support/honoRoute";

const reportId = "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d";
const tvShowId = "7d1b9c40-2f6e-4a8b-9c3d-1e2f3a4b5c6d";
const newsOrganisationId = "550e8400-e29b-41d4-a716-446655440000";

type Handler = typeof moveNewsReportToTvShow;

const routes: ReadonlyArray<{
	label: string;
	path: string;
	azureSuffix: string;
	handler: Handler;
	request: Record<string, unknown>;
	accepted: Record<string, unknown>;
	hint: string;
}> = [
	{
		label: "tvshow",
		path: `/newsreport/${reportId}/tvshow`,
		azureSuffix: `/newsreport/${reportId}/tvshow`,
		handler: moveNewsReportToTvShow,
		request: { tvShowName: "Synthetic Show", createShow: true, publisher: "Synthetic Publisher", title: "Synthetic Title" },
		accepted: { tvShowId, tvShowName: "Synthetic Show", episodeId: reportId, createdShow: true, failureIndexing: false, emptiedNewsOrganisationId: newsOrganisationId },
		hint: "tvShowName"
	},
	{
		label: "film",
		path: `/newsreport/${reportId}/film`,
		azureSuffix: `/newsreport/${reportId}/film`,
		handler: moveNewsReportToFilm,
		request: { title: "Synthetic Film", identityDecision: "select", selectedIdentityKey: "tmdb:1" },
		accepted: { filmId: reportId, name: "Synthetic Film", failureIndexing: false, emptiedNewsOrganisationId: newsOrganisationId },
		hint: "identityDecision"
	}
];

const route = (r: (typeof routes)[number]) => `/newsreport/:id/${r.label}`;

function curateApp(r: (typeof routes)[number]) {
	return appWithPermissions(route(r), "post", r.handler, ["curate"]);
}

describe.each(routes)("move news report ($label)", (r) => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("POSTs the body to the Azure newsreport route with the curator token and returns the 202 outcome", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(r.accepted), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await curateApp(r).request(
			r.path,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify(r.request) },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(r.accepted);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as unknown as [URL | string, RequestInit];
		expect(String(url).endsWith(r.azureSuffix)).toBe(true);
		expect(init.method).toBe("POST");
		expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-token");
		expect(JSON.parse(String(init.body))).toEqual(r.request);
	});

	it("sends {} to Azure when the request has no body", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await curateApp(r).request(r.path, { method: "POST", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(400);
		const [, init] = fetchMock.mock.calls[0] as unknown as [URL | string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({});
	});

	it("returns 400 for a malformed body without calling Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const resp = await curateApp(r).request(r.path, { method: "POST", headers: authJsonHeaders, body: "{not json" }, testEnv());

		expect(resp.status).toBe(400);
		expect(((await resp.json()) as { error: string }).error).toContain(r.hint);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 403, not 400, for a malformed body without curate", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route(r), "post", r.handler, ["submit"]);

		const resp = await app.request(r.path, { method: "POST", headers: authJsonHeaders, body: "{not json" }, testEnv());

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 401 without a token payload and does not call Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload(route(r), "post", r.handler, null);

		const resp = await app.request(r.path, { method: "POST", body: "{}" }, testEnv());

		expect(resp.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		[400, { error: "A removed news report cannot be moved" }],
		[404, { reportId, error: "News report not found" }],
		[409, { error: "The news report id is already a film", failureIndexing: false }],
		[500, { error: "Search swap failed", failureIndexing: true }]
	] as const)("passes Azure %s through", async (status, body) => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

		const resp = await curateApp(r).request(r.path, { method: "POST", headers: authJsonHeaders, body: "{}" }, testEnv());

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});
});

describe("move news report to film identity prompt", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("passes Azure's 200 identityDecision outcome through, because nothing was written and the client re-POSTs", async () => {
		const body = { identityDecision: { target: "Film", query: "Synthetic Film", candidates: [] }, failureIndexing: false };
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
		const app = appWithPermissions("/newsreport/:id/film", "post", moveNewsReportToFilm, ["curate"]);

		const resp = await app.request(`/newsreport/${reportId}/film`, { method: "POST", headers: authJsonHeaders, body: "{}" }, testEnv());

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(body);
	});
});

describe("move news report OpenAPI route contract", () => {
	type JsonContent = { content?: { "application/json"?: { schema?: unknown } } };
	const moveRoutes = [
		["POST /newsreport/:id/tvshow", MoveNewsReportToTvShowRoute, episodeTvShowMoveRequestSchema, episodeTvShowMoveResponseSchema],
		["POST /newsreport/:id/film", MoveNewsReportToFilmRoute, episodeFilmMoveRequestSchema, episodeFilmMoveResponseSchema]
	] as const;

	it.each(moveRoutes)("%s documents the episode-move body, the 202 outcome and curate auth", (_, Route, requestSchema, responseSchema) => {
		const schema = Route.openApiSchema;
		const request = schema.request as { body?: JsonContent } | undefined;
		expect(request?.body?.content?.["application/json"]?.schema).toBe(requestSchema);
		const accepted = schema.responses?.[202] as JsonContent | undefined;
		expect(accepted?.content?.["application/json"]?.schema).toBe(responseSchema);
		for (const status of [400, 401, 403, 404, 409, 500]) {
			expect(schema.responses?.[status]).toBeDefined();
		}
		expect(Route.requiresAuth).toBe(true);
		expect(schema.security).toEqual([{ bearerAuth: [] }]);
		expect(schema.description ?? "").toMatch(/emptiedNewsOrganisationId/);
		expect(schema.description ?? "").toMatch(/never changed or deleted/);
	});

	it("parses emptiedNewsOrganisationId on both outcomes and rejects a non-guid", () => {
		expect(episodeTvShowMoveResponseSchema.parse({ tvShowId, emptiedNewsOrganisationId: newsOrganisationId }).emptiedNewsOrganisationId)
			.toBe(newsOrganisationId);
		expect(episodeFilmMoveResponseSchema.parse({ filmId: reportId, emptiedNewsOrganisationId: newsOrganisationId }).emptiedNewsOrganisationId)
			.toBe(newsOrganisationId);
		expect(episodeTvShowMoveResponseSchema.parse({ tvShowId }).emptiedNewsOrganisationId).toBeUndefined();
		expect(() => episodeFilmMoveResponseSchema.parse({ emptiedNewsOrganisationId: "not-a-guid" })).toThrow();
	});
});

describe("move news report on the Worker app", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each([`/newsreport/${reportId}/tvshow`, `/newsreport/${reportId}/film`])(
		"routes POST %s behind auth (401 without a token, not 404) and does not call Azure",
		async (path) => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			const resp = await worker.fetch(
				new Request(`https://api.example${path}`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }),
				auth0TestEnv(),
				{} as ExecutionContext
			);
			expect(resp.status).toBe(401);
			expect(fetchMock).not.toHaveBeenCalled();
		}
	);

	it("404s an unregistered news report command (guards the registration check above)", async () => {
		const resp = await worker.fetch(
			new Request(`https://api.example/newsreport/${reportId}/synthetickind`, { method: "POST", body: "{}" }),
			auth0TestEnv(),
			{} as ExecutionContext
		);
		expect(resp.status).toBe(404);
	});
});
