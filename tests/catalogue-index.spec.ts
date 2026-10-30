import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import worker from "../src/index";
import { indexNewsOrganisation, indexTvShow } from "../src/indexCatalogueParent";
import { IndexNewsOrganisationRoute, IndexTvShowRoute } from "../src/openapiRoutes";
import { catalogueIndexRejectionSchema, catalogueIndexResponseSchema, catalogueIndexTimedOutSchema } from "../src/openapiSchemas";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";
import { testEnv as auth0TestEnv } from "./support/honoRoute";

const id = "550e8400-e29b-41d4-a716-446655440000";
const itemIds = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
const name = "Synthetic Drama & Co";
const slashName = "Synthetic Desk 24/7";
const okBody = { indexedItemIds: itemIds, searchIndexerState: "Executed" };
const timedOutBody = {
	reason: "TimedOut",
	message: "Indexing ran out of time; anything it saved will reach search on the next pull-indexer run. Try again later."
};

const routes = [
	["/newsorganisation/index/:identifier{.+}", "/newsorganisation/index/", indexNewsOrganisation, "/api/newsorganisation/index/"],
	["/tvshow/index/:identifier{.+}", "/tvshow/index/", indexTvShow, "/api/tvshow/index/"]
] as const;

function stubFetch(status: number, body: unknown) {
	const fetchMock = vi.fn(async () => new Response(body === null ? null : JSON.stringify(body), { status }));
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("catalogue parent index Azure proxies", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each(routes)("POST %s needs curate like the podcast index: submit alone is 403, with no Azure call", async (route, prefix, handler) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "post", handler, ["submit"]);
		const resp = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders, body: "{}" }, testEnv());
		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(routes)("POST %s returns 401 without a token payload and does not call Azure", async (route, prefix, handler) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload(route, "post", handler, null);
		const resp = await app.request(`${prefix}${id}`, { method: "POST", body: "{}" }, testEnv());
		expect(resp.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(routes)(
		"POST %s forwards the curator token and the encoded name to Azure with no body and passes the 200 outcome through",
		async (route, prefix, handler, azurePrefix) => {
			const fetchMock = stubFetch(200, okBody);
			const app = appWithPermissions(route, "post", handler, ["curate"]);
			const resp = await app.request(
				`${prefix}${encodeURIComponent(name)}`,
				{ method: "POST", headers: authJsonHeaders, body: "{}" },
				testEnv()
			);
			expect(resp.status).toBe(200);
			expect(await resp.json()).toEqual(okBody);
			const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
			expect(String(url)).toBe(`https://functions.example${azurePrefix}${encodeURIComponent(name)}`);
			expect(init?.method).toBe("POST");
			expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
			expect(init?.body ?? null).toBeNull();
		}
	);

	it.each(routes)("POST %s keeps a slash in the name and encodes it for Azure", async (route, prefix, handler, azurePrefix) => {
		const fetchMock = stubFetch(200, okBody);
		const app = appWithPermissions(route, "post", handler, ["curate"]);
		const resp = await app.request(
			`${prefix}${encodeURIComponent(slashName)}`,
			{ method: "POST", headers: authJsonHeaders },
			testEnv()
		);
		expect(resp.status).toBe(200);
		const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(String(url)).toBe(`https://functions.example${azurePrefix}${encodeURIComponent(slashName)}`);
	});

	it.each(routes)("POST %s forwards 400 {reason}, 404, 409 (guid array), 500 {error} and 504 {reason: TimedOut}, and maps other statuses to 500", async (route, prefix, handler) => {
		const app = appWithPermissions(route, "post", handler, ["curate"]);
		for (const [status, body] of [
			[400, { reason: "NotAutoIndexed" }],
			[400, { reason: "SourcePodcastStillExists" }],
			[404, null],
			[409, itemIds],
			[500, { error: "Unable to index TV show" }],
			[504, timedOutBody]
		] as const) {
			stubFetch(status, body);
			const resp = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders }, testEnv());
			expect(resp.status).toBe(status);
			if (body !== null) {
				expect(await resp.json()).toEqual(body);
			}
			vi.unstubAllGlobals();
		}
		stubFetch(502, { error: "Bad gateway" });
		const gateway = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders }, testEnv());
		expect(gateway.status).toBe(500);
		expect(await gateway.json()).toEqual({ error: "Error" });
	});

	it.each(routes)("POST %s advertises POST and OPTIONS only (no GET)", async (route, prefix, handler) => {
		stubFetch(200, okBody);
		const app = appWithPermissions(route, "post", handler, ["curate"]);
		const resp = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders }, testEnv());
		expect(resp.headers.get("Access-Control-Allow-Methods")).toBe("POST,OPTIONS");
	});
});

describe("catalogue parent index schemas and OpenAPI route contracts", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const routeClasses = [
		["/newsorganisation/index/", IndexNewsOrganisationRoute],
		["/tvshow/index/", IndexTvShowRoute]
	] as const;

	it("parses the index outcome and the 400 reason", () => {
		expect(catalogueIndexResponseSchema.parse(okBody)).toEqual(okBody);
		expect(catalogueIndexResponseSchema.parse({ indexedItemIds: [], searchIndexerState: "NoDocuments" }))
			.toEqual({ indexedItemIds: [], searchIndexerState: "NoDocuments" });
		expect(() => catalogueIndexResponseSchema.parse({ indexedItemIds: ["not-a-guid"], searchIndexerState: "Executed" })).toThrow();
		expect(catalogueIndexRejectionSchema.parse({ reason: "NotAutoIndexed" })).toEqual({ reason: "NotAutoIndexed" });
		expect(() => catalogueIndexRejectionSchema.parse({ reason: "Other" })).toThrow();
		expect(catalogueIndexTimedOutSchema.parse(timedOutBody)).toEqual(timedOutBody);
		expect(() => catalogueIndexTimedOutSchema.parse({ reason: "NotAutoIndexed", message: "x" })).toThrow();
	});

	it.each(routeClasses)("%s route is curate-only, has no request body, and documents 200, 400, 404, 409 and 504", (_prefix, Route) => {
		expect(Route.requiresAuth).toBe(true);
		const schema = Route.openApiSchema;
		expect(schema.security).toEqual([{ bearerAuth: [] }]);
		expect(schema.description).toMatch(/[Cc]urate/);
		const request = schema.request as { body?: unknown } | undefined;
		expect(request?.body).toBeUndefined();
		const ok = schema.responses?.[200] as { content?: { "application/json"?: { schema?: unknown } } } | undefined;
		expect(ok?.content?.["application/json"]?.schema).toBe(catalogueIndexResponseSchema);
		const bad = schema.responses?.[400] as { content?: { "application/json"?: { schema?: unknown } } } | undefined;
		expect(bad?.content?.["application/json"]?.schema).toBe(catalogueIndexRejectionSchema);
		for (const status of [404, 409]) {
			expect(schema.responses?.[status]).toBeDefined();
		}
		const timedOut = schema.responses?.[504] as { content?: { "application/json"?: { schema?: unknown } } } | undefined;
		expect(timedOut?.content?.["application/json"]?.schema).toBe(catalogueIndexTimedOutSchema);
	});

	it.each(routeClasses)("the deployed Worker app routes POST %s{identifier} (401 without a token, not 404)", async (prefix) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		for (const identifier of [id, encodeURIComponent(slashName)]) {
			const resp = await worker.fetch(
				new Request(`https://api.example${prefix}${identifier}`, { method: "POST" }),
				auth0TestEnv(),
				{} as ExecutionContext
			);
			expect(resp.status).toBe(401);
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
