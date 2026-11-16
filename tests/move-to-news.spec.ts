import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import worker from "../src/index";
import { moveEpisodeToNews, movePodcastEpisodesToNews } from "../src/moveToNews";
import { MoveEpisodeToNewsRoute, MovePodcastEpisodesToNewsRoute } from "../src/openapiRoutes";
import { episodeNewsMoveRequestSchema, episodeNewsMoveResponseSchema, podcastNewsMoveRequestSchema } from "../src/openapiSchemas";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";
import { testEnv as auth0TestEnv } from "./support/honoRoute";

const podcastId = "7d1b9c40-2f6e-4a8b-9c3d-1e2f3a4b5c6d";
const episodeId = "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d";
const otherEpisodeId = "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
const newsOrganisationId = "550e8400-e29b-41d4-a716-446655440000";

type Handler = typeof moveEpisodeToNews;

const routes: ReadonlyArray<{ label: string; route: string; path: string; azureSuffix: string; handler: Handler; request: Record<string, unknown> }> = [
	{
		label: "episode",
		route: "/episode/:podcastId/:episodeId/news",
		path: `/episode/${podcastId}/${episodeId}/news`,
		azureSuffix: `/episode/${podcastId}/${episodeId}/news`,
		handler: moveEpisodeToNews,
		request: { newsOrganisationName: "Synthetic News", createOrganisation: true, publisher: "Synthetic Publisher" }
	},
	{
		label: "podcast batch",
		route: "/podcast/:id/news",
		path: `/podcast/${podcastId}/news`,
		azureSuffix: `/podcast/${podcastId}/news`,
		handler: movePodcastEpisodesToNews,
		request: { episodeIds: [episodeId, otherEpisodeId], newsOrganisationId }
	}
];

function curateApp(r: (typeof routes)[number]) {
	return appWithPermissions(r.route, "post", r.handler, ["curate"]);
}

describe.each(routes)("move to news ($label)", (r) => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("POSTs the body to the Azure route with the curator token and returns the 202 outcome", async () => {
		const outcome = {
			newsOrganisationId,
			newsOrganisationName: "Synthetic News",
			createdOrganisation: true,
			movedEpisodeIds: [episodeId],
			alreadyMovedEpisodeIds: [],
			notFoundEpisodeIds: [],
			conflictEpisodeIds: [],
			failureIndexing: false
		};
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(outcome), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await curateApp(r).request(
			r.path,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify(r.request) },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(outcome);
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
		expect(((await resp.json()) as { error: string }).error).toContain("newsOrganisationName");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 403, not 400, for a malformed body without curate", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(r.route, "post", r.handler, ["submit"]);

		const resp = await app.request(r.path, { method: "POST", headers: authJsonHeaders, body: "{not json" }, testEnv());

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 403 without curate", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(r.route, "post", r.handler, ["submit"]);

		const resp = await app.request(r.path, { method: "POST", headers: authJsonHeaders, body: "{}" }, testEnv());

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 401 without a token payload and does not call Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload(r.route, "post", r.handler, null);

		const resp = await app.request(r.path, { method: "POST", body: "{}" }, testEnv());

		expect(resp.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		[400, { error: "Send exactly one of newsOrganisationId or newsOrganisationName" }],
		[404, { newsOrganisationId: null, createdOrganisation: false, movedEpisodeIds: [], alreadyMovedEpisodeIds: [], notFoundEpisodeIds: [otherEpisodeId], conflictEpisodeIds: [], failureIndexing: false }],
		[409, { newsOrganisationId, createdOrganisation: false, movedEpisodeIds: [], alreadyMovedEpisodeIds: [], notFoundEpisodeIds: [], conflictEpisodeIds: [episodeId], error: "Already a film", failureIndexing: false }],
		[500, { newsOrganisationId, createdOrganisation: false, movedEpisodeIds: [], alreadyMovedEpisodeIds: [], notFoundEpisodeIds: [], conflictEpisodeIds: [], error: "Search swap failed", failureIndexing: true }]
	] as const)("passes Azure %s through", async (status, body) => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

		const resp = await curateApp(r).request(r.path, { method: "POST", headers: authJsonHeaders, body: "{}" }, testEnv());

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});
});

describe("move to news OpenAPI route contract", () => {
	type JsonContent = { content?: { "application/json"?: { schema?: unknown } } };
	const newsRoutes = [
		["POST /episode/:podcastId/:episodeId/news", MoveEpisodeToNewsRoute, episodeNewsMoveRequestSchema],
		["POST /podcast/:id/news", MovePodcastEpisodesToNewsRoute, podcastNewsMoveRequestSchema]
	] as const;

	it.each(newsRoutes)("%s documents its request body, the 202 command outcome and curate auth", (_, Route, requestSchema) => {
		const schema = Route.openApiSchema;
		const request = schema.request as { body?: JsonContent } | undefined;
		expect(request?.body?.content?.["application/json"]?.schema).toBe(requestSchema);
		const accepted = schema.responses?.[202] as JsonContent | undefined;
		expect(accepted?.content?.["application/json"]?.schema).toBe(episodeNewsMoveResponseSchema);
		for (const status of [400, 401, 403, 404, 409, 500]) {
			expect(schema.responses?.[status]).toBeDefined();
		}
		expect(Route.requiresAuth).toBe(true);
		expect(schema.security).toEqual([{ bearerAuth: [] }]);
	});

	it.each(newsRoutes)("%s documents the move contract agreed on RPP #1389", (_, Route) => {
		const schema = Route.openApiSchema;
		const description = schema.description ?? "";
		expect(description).toMatch(/length-derived Ignored is cleared/i);
		expect(description).toMatch(/removed flag is kept/i);
		expect(description).toMatch(/latestReleased/);
		expect(description).toMatch(/short links? .*deleted/i);
		expect(description).toMatch(/movedEpisodeIds/);
		expect(schema.responses?.[400]?.description).toMatch(/500/);
		expect(schema.responses?.[400]?.description).toMatch(/empty guid/i);
	});
});

describe("move to news on the Worker app", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each([
		["/episode/:podcastId/:episodeId/news", `/episode/${podcastId}/${episodeId}/news`],
		["/podcast/:id/news", `/podcast/${podcastId}/news`]
	])("routes POST %s behind auth (401 without a token, not 404) and does not call Azure", async (_, path) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const resp = await worker.fetch(
			new Request(`https://api.example${path}`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }),
			auth0TestEnv(),
			{} as ExecutionContext
		);
		expect(resp.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("404s an unregistered episode command (guards the registration check above)", async () => {
		const resp = await worker.fetch(
			new Request(`https://api.example/episode/${podcastId}/${episodeId}/synthetickind`, { method: "POST", body: "{}" }),
			auth0TestEnv(),
			{} as ExecutionContext
		);
		expect(resp.status).toBe(404);
	});
});
