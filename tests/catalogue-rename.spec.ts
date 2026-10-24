import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import worker from "../src/index";
import { RenameFilmRoute, RenameNewsOrganisationRoute, RenameTvShowRoute } from "../src/openapiRoutes";
import { catalogueRenameRequestSchema, catalogueRenameResponseSchema, podcastRenameResponseSchema } from "../src/openapiSchemas";
import { renameFilm, renameNewsOrganisation, renameTvShow } from "../src/renameCatalogue";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";
import { testEnv as auth0TestEnv } from "./support/honoRoute";

const id = "550e8400-e29b-41d4-a716-446655440000";
const ambiguousIds = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
const oldName = "Synthetic Drama & Co";
const slashName = "Synthetic Desk 24/7";

const routes = [
	["/newsorganisation/name/:identifier{.+}", "/newsorganisation/name/", renameNewsOrganisation, "/api/newsorganisation/name/"],
	["/tvshow/name/:identifier{.+}", "/tvshow/name/", renameTvShow, "/api/tvshow/name/"],
	["/film/name/:identifier{.+}", "/film/name/", renameFilm, "/api/film/name/"]
] as const;

function stubFetch(status: number, body: unknown) {
	const fetchMock = vi.fn(
		async () => new Response(body === null ? null : JSON.stringify(body), { status })
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const renameBody = JSON.stringify({ newName: "Synthetic Drama Revisited" });

describe("catalogue rename Azure proxies (RPP #1053)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each(routes)("POST %s needs admin like the podcast rename: curate alone is 403, with no Azure call", async (route, prefix, handler) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "post", handler, ["curate"]);
		const resp = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders, body: renameBody }, testEnv());
		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(routes)("POST %s returns 401 without a token payload and does not call Azure", async (route, prefix, handler) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload(route, "post", handler, null);
		const resp = await app.request(`${prefix}${id}`, { method: "POST", body: renameBody }, testEnv());
		expect(resp.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(routes)(
		"POST %s forwards the admin token, the encoded identifier and the body to Azure and passes the 200 {indexState} through",
		async (route, prefix, handler, azurePrefix) => {
			const fetchMock = stubFetch(200, { indexState: "Executed" });
			const app = appWithPermissions(route, "post", handler, ["admin"]);
			const resp = await app.request(
				`${prefix}${encodeURIComponent(oldName)}`,
				{ method: "POST", headers: authJsonHeaders, body: renameBody },
				testEnv()
			);
			expect(resp.status).toBe(200);
			expect(await resp.json()).toEqual({ indexState: "Executed" });
			const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
			expect(String(url)).toBe(`https://functions.example${azurePrefix}${encodeURIComponent(oldName)}`);
			expect(init?.method).toBe("POST");
			expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
			expect(JSON.parse(String(init?.body))).toEqual({ newName: "Synthetic Drama Revisited" });
		}
	);

	it.each(routes)(
		"POST %s keeps a slash in the old name (Hono decodes %2F before routing) and encodes it for Azure",
		async (route, prefix, handler, azurePrefix) => {
			const fetchMock = stubFetch(200, { indexState: "Executed" });
			const app = appWithPermissions(route, "post", handler, ["admin"]);
			const resp = await app.request(
				`${prefix}${encodeURIComponent(slashName)}`,
				{ method: "POST", headers: authJsonHeaders, body: renameBody },
				testEnv()
			);
			expect(resp.status).toBe(200);
			expect(await resp.json()).toEqual({ indexState: "Executed" });
			const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
			expect(String(url)).toBe(`https://functions.example${azurePrefix}${encodeURIComponent(slashName)}`);
		}
	);

	it.each(routes)("POST %s forwards 400, 401, 404, 409 (empty clash or ambiguous guid array) and 500 bodies, and maps other statuses to 500", async (route, prefix, handler) => {
		const app = appWithPermissions(route, "post", handler, ["admin"]);
		for (const [status, body] of [
			[400, null],
			[404, null],
			[409, null],
			[409, ambiguousIds]
		] as const) {
			stubFetch(status, body);
			const resp = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders, body: renameBody }, testEnv());
			expect(resp.status).toBe(status);
			if (body !== null) {
				expect(await resp.json()).toEqual(body);
			}
			vi.unstubAllGlobals();
		}
		stubFetch(401, { Message: "Unauthorised" });
		const unauthorised = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders, body: renameBody }, testEnv());
		expect(unauthorised.status).toBe(401);
		expect(await unauthorised.json()).toEqual({ Message: "Unauthorised" });
		vi.unstubAllGlobals();
		stubFetch(500, { error: "Unable to rename" });
		const failed = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders, body: renameBody }, testEnv());
		expect(failed.status).toBe(500);
		expect(await failed.json()).toEqual({ error: "Unable to rename" });
		vi.unstubAllGlobals();
		stubFetch(502, { error: "Bad gateway" });
		const gateway = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders, body: renameBody }, testEnv());
		expect(gateway.status).toBe(500);
		expect(await gateway.json()).toEqual({ error: "Error" });
	});

	it.each(routes)("POST %s answers 400 in the Worker for a blank, whitespace-only or `/` name, without calling Azure", async (route, prefix, handler) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "post", handler, ["admin"]);
		for (const body of [{ newName: "" }, { newName: "   " }, { newName: "Synthetic/Drama" }, {}, "not json"]) {
			const resp = await app.request(
				`${prefix}${id}`,
				{ method: "POST", headers: authJsonHeaders, body: typeof body === "string" ? body : JSON.stringify(body) },
				testEnv()
			);
			expect(resp.status).toBe(400);
			expect(await resp.json()).toEqual({ error: expect.any(String) });
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(routes)("POST %s still answers 403 (not 400) to a curate caller with an invalid name", async (route, prefix, handler) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "post", handler, ["curate"]);
		const resp = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders, body: JSON.stringify({ newName: "a/b" }) }, testEnv());
		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(routes)("POST %s forwards the trimmed name to Azure", async (route, prefix, handler) => {
		const fetchMock = stubFetch(200, { indexState: "Executed" });
		const app = appWithPermissions(route, "post", handler, ["admin"]);
		const resp = await app.request(`${prefix}${id}`, { method: "POST", headers: authJsonHeaders, body: JSON.stringify({ newName: "  Synthetic Drama Revisited  " }) }, testEnv());
		expect(resp.status).toBe(200);
		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(String(init?.body))).toEqual({ newName: "Synthetic Drama Revisited" });
	});
});

describe("catalogue rename schemas and OpenAPI route contracts", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const routeClasses = [
		["/newsorganisation/name/", RenameNewsOrganisationRoute],
		["/tvshow/name/", RenameTvShowRoute],
		["/film/name/", RenameFilmRoute]
	] as const;

	it("parses the rename body and the podcast-shaped response", () => {
		expect(catalogueRenameRequestSchema.parse({ newName: "Synthetic New" })).toEqual({ newName: "Synthetic New" });
		expect(catalogueRenameRequestSchema.parse({ newName: "  Synthetic New " })).toEqual({ newName: "Synthetic New" });
		expect(() => catalogueRenameRequestSchema.parse({ newName: "" })).toThrow();
		expect(() => catalogueRenameRequestSchema.parse({ newName: "   " })).toThrow();
		expect(() => catalogueRenameRequestSchema.parse({ newName: "Synthetic/New" })).toThrow();
		expect(() => catalogueRenameRequestSchema.parse({ newPodcastName: "Synthetic New" })).toThrow();
		const response = { indexState: "NoDocuments" };
		expect(catalogueRenameResponseSchema.parse(response)).toEqual(podcastRenameResponseSchema.parse(response));
	});

	it.each(routeClasses)("%s route is admin-only and documents the rename body, 200 and 400/404/409", (_prefix, Route) => {
		expect(Route.requiresAuth).toBe(true);
		const schema = Route.openApiSchema;
		expect(schema.security).toEqual([{ bearerAuth: [] }]);
		expect(schema.description).toMatch(/`admin`/);
		expect(schema.responses?.[403]?.description).toMatch(/without `admin`/);
		const request = schema.request as { body?: { content?: { "application/json"?: { schema?: unknown } } } } | undefined;
		expect(request?.body?.content?.["application/json"]?.schema).toBe(catalogueRenameRequestSchema);
		const ok = schema.responses?.[200] as { content?: { "application/json"?: { schema?: unknown } } } | undefined;
		expect(ok?.content?.["application/json"]?.schema).toBe(catalogueRenameResponseSchema);
		for (const status of [400, 404, 409]) {
			expect(schema.responses?.[status]).toBeDefined();
		}
	});

	it.each(routeClasses)("the deployed Worker app routes POST %s{identifier} to the rename handler (401 without a token, not 404)", async (prefix) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const resp = await worker.fetch(
			new Request(`https://api.example${prefix}${id}`, { method: "POST", body: renameBody, headers: { "Content-Type": "application/json" } }),
			auth0TestEnv(),
			{} as ExecutionContext
		);
		expect(resp.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(routeClasses)(
		"the deployed Worker app routes POST %s{identifier} with an encoded slash name (401 without a token, not 404)",
		async (prefix) => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			const resp = await worker.fetch(
				new Request(`https://api.example${prefix}${encodeURIComponent(slashName)}`, {
					method: "POST",
					body: renameBody,
					headers: { "Content-Type": "application/json" }
				}),
				auth0TestEnv(),
				{} as ExecutionContext
			);
			expect(resp.status).toBe(401);
			expect(fetchMock).not.toHaveBeenCalled();
		}
	);

	it("the Worker app 404s an unregistered rename kind (guards the registration check above)", async () => {
		const resp = await worker.fetch(
			new Request(`https://api.example/synthetickind/name/${id}`, { method: "POST", body: renameBody }),
			auth0TestEnv(),
			{} as ExecutionContext
		);
		expect(resp.status).toBe(404);
	});
});
