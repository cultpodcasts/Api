import { fromHono } from "chanfana";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({
	ImageResponse: class ImageResponse {}
}));
import { putHeroCurationOpenApiSchema } from "../src/heroCurationOpenApi";
import {
	AddBookmarkRoute,
	AttachEpisodeAsTrailerRoute,
	CreatePersonRoute,
	DeletePodcastEpisodeRoute,
	GetDiscoveryScheduleRoute,
	GetLanguagesRoute,
	GetPeopleRoute,
	HomepageRoute,
	PublicGetEpisodeRoute,
	PutHeroCurationRoute,
	SearchAdminDocsRoute,
	SearchAdminInventoryRoute,
	SearchAdminRebuildRoute,
	SearchAdminRebuildStatusRoute
} from "../src/openapiRoutes";
import { registerBearerAuthScheme } from "../src/openapiRouteFactory";
import { SubmitLookupRoute, SubmitRoute } from "../src/openapiSubmitPodcastRoutes";

function operation(doc: { paths?: Record<string, Record<string, unknown>> }, path: string, method: string) {
	return doc.paths?.[path]?.[method] as {
		security?: unknown;
		description?: string;
		responses?: Record<string, { description?: string; content?: Record<string, unknown> }>;
	};
}

describe("OpenAPI auth and response contracts", () => {
	const app = new Hono();
	const api = fromHono(app, {
		docs_url: null,
		schema: { info: { title: "Cult Podcasts API", version: "0" } }
	});
	registerBearerAuthScheme(
		(api as unknown as { registry: Parameters<typeof registerBearerAuthScheme>[0] }).registry
	);
	api.get("/people", GetPeopleRoute);
	api.get("/homepage", HomepageRoute);
	api.get("/discovery-schedule", GetDiscoveryScheduleRoute);
	api.get("/languages", GetLanguagesRoute);
	api.get("/public/episode/:id", PublicGetEpisodeRoute);
	api.put("/bookmark/:episodeId", AddBookmarkRoute);
	api.delete("/episode/:podcastId/:episodeId", DeletePodcastEpisodeRoute);
	api.post("/person", CreatePersonRoute);
	api.post("/submit", SubmitRoute);
	api.get("/submit/lookup", SubmitLookupRoute);
	api.post("/episode/:podcastId/:episodeId/trailer", AttachEpisodeAsTrailerRoute);
	api.post("/search/admin/docs", SearchAdminDocsRoute);
	api.get("/search/admin/docs/inventory", SearchAdminInventoryRoute);
	api.get("/search/admin/rebuild", SearchAdminRebuildStatusRoute);
	api.post("/search/admin/rebuild/:action", SearchAdminRebuildRoute);
	const doc = (api as unknown as { schema: {
		components?: { securitySchemes?: Record<string, { type?: string; scheme?: string }> };
		paths?: Record<string, Record<string, unknown>>;
	} }).schema;

	it("documents attach-as-trailer createFilm in the request body and the 200 identity prompt (#1418)", () => {
		const attach = operation(doc, "/episode/{podcastId}/{episodeId}/trailer", "post") as ReturnType<typeof operation> & {
			requestBody?: { content?: Record<string, unknown> };
		};
		const body = JSON.stringify(attach.requestBody?.content?.["application/json"]);
		expect(body).toMatch(/"createFilm"/);
		expect(body).toMatch(/"filmName"/);
		expect(body).toMatch(/"selectedIdentityKey"/);
		expect(JSON.stringify(attach.responses?.["200"]?.content?.["application/json"])).toMatch(/"identityDecision"/);
		expect(JSON.stringify(attach.responses?.["202"]?.content?.["application/json"])).toMatch(/"filmCreated"/);
	});

	it("documents POST /search/admin/docs as an M2M write:search-index command with the search Worker's envelopes (SP-1.4)", () => {
		const admin = operation(doc, "/search/admin/docs", "post");
		expect(admin.security).toEqual([{ bearerAuth: [] }]);
		expect(admin.description).toMatch(/M2M \(client_credentials\) token with `write:search-index`/);
		expect(admin.responses?.["403"]?.description).toBe("Forbidden — authenticated without `write:search-index`");
		const schema = (status: string) => JSON.stringify(admin.responses?.[status]?.content?.["application/json"]);
		for (const key of ["upserted", "deleted", "stale", "notFound"]) expect(schema("200")).toContain(`"${key}"`);
		for (const status of ["400", "503"]) {
			expect(schema(status)).toMatch(/"code"/);
			expect(schema(status)).toMatch(/"message"/);
		}
		expect(schema("502")).toMatch(/UpstreamSearchError/);
	});

	it("documents GET /search/admin/docs/inventory with the writer's auth, keyset paging and the search Worker's envelopes (SP-2.2)", () => {
		const inventory = operation(doc, "/search/admin/docs/inventory", "get") as ReturnType<typeof operation> & {
			parameters?: { name: string; in: string }[];
		};
		expect(inventory.security).toEqual([{ bearerAuth: [] }]);
		expect(inventory.description).toMatch(/`write:search-index`/);
		expect(inventory.responses?.["403"]?.description).toBe("Forbidden — authenticated without `write:search-index`");
		expect(inventory.parameters?.filter((p) => p.in === "query").map((p) => p.name).sort()).toEqual(["after", "limit"]);
		const page = JSON.stringify(inventory.responses?.["200"]?.content?.["application/json"]);
		for (const key of ["items", "id", "modifiedAt", "next"]) expect(page).toContain(`"${key}"`);
	});

	it("documents the D1 index rebuild routes with the writer's auth, the action path and the 409 envelope (SP-2.3)", () => {
		const rebuild = operation(doc, "/search/admin/rebuild/{action}", "post") as ReturnType<typeof operation> & {
			parameters?: { name: string; in: string; schema?: { enum?: string[] } }[];
		};
		const state = operation(doc, "/search/admin/rebuild", "get");
		for (const op of [rebuild, state]) {
			expect(op.security).toEqual([{ bearerAuth: [] }]);
			expect(op.description).toMatch(/`write:search-index`/);
			expect(op.responses?.["403"]?.description).toBe("Forbidden — authenticated without `write:search-index`");
		}
		expect(rebuild.parameters?.find((p) => p.in === "path")?.schema?.enum).toEqual(["start", "docs", "swap", "check", "finish", "swap-back", "abort"]);
		expect(JSON.stringify(rebuild.responses?.["409"]?.content?.["application/json"])).toMatch(/VerificationFailed/);
		for (const key of ["live", "shadow", "parked", "state"]) {
			expect(JSON.stringify(state.responses?.["200"]?.content?.["application/json"])).toContain(`"${key}"`);
		}
	});

	it("publishes a bearer scheme and does not treat ID-token roles as the check", () => {
		const bearer = doc.components?.securitySchemes?.bearerAuth;
		expect(bearer?.type).toBe("http");
		expect(bearer?.scheme).toBe("bearer");
		expect(JSON.stringify(bearer)).toMatch(/permissions/);
		expect(JSON.stringify(bearer)).toMatch(/scope/);
		expect(JSON.stringify(bearer)).toMatch(/roles are not checked/);
	});

	it("marks GET /people as curate on the permissions claim, with a JSON list and a bodyless 404", () => {
		const people = operation(doc, "/people", "get");
		expect(people.security).toEqual([{ bearerAuth: [] }]);
		expect(people.description).toMatch(/`curate`/);
		expect(people.description).toMatch(/permissions` array/);
		expect(people.description).toMatch(/scope` value alone is not accepted/);
		expect(people.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
		expect(people.responses?.["401"]?.content?.["application/json"]).toBeTruthy();
		expect(people.responses?.["403"]?.description).toMatch(/without `curate`/);
		expect(people.responses?.["404"]?.description).toMatch(/missing/);
		expect(people.responses?.["404"]).not.toHaveProperty("content");
	});

	it("types discovery schedule instants as date-time and leaves the slot label a string", () => {
		const schedule = operation(doc, "/discovery-schedule", "get");
		const schema = JSON.stringify(schedule.responses?.["200"]?.content?.["application/json"]);
		expect(schema).toMatch(/"slotStartUtc"[\s\S]*?"format":"date-time"/);
		expect(schema).toMatch(/"slotStartUk"[\s\S]*?"format":"date-time"/);
		expect(schema).toMatch(/"slotStartUtc"[\s\S]*?"example":"2026-10-08T21:30:00Z"/);
		expect(schema).toMatch(/"slotStartUtc"[\s\S]*?"pattern":"Z\$"/);
		expect(schema).toMatch(/"slotStartUk"[\s\S]*?"example":"2026-10-08T22:30:00\+01:00"/);
		expect(schema).toMatch(/"slotStartUk":\{[^}]*"pattern":"\[\+-\]\\\\d\{2\}:\\\\d\{2\}\$"/);
		expect(schema).toMatch(/"slotStartUk"[\s\S]*?"description":"Same slot start as UK local wall-clock time/);
		expect(schema).not.toMatch(/"slotId"[\s\S]{0,80}"format":"date-time"/);
		expect(schema).not.toMatch(/"runTimes"[\s\S]{0,120}"format":"date-time"/);
	});

	it("leaves the homepage public and JSON", () => {
		const homepage = operation(doc, "/homepage", "get");
		expect(homepage.security).toEqual([]);
		expect(homepage.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
		expect(homepage.responses?.["404"]).not.toHaveProperty("content");
	});

	it("documents bookmark save as any token, with 403 and JSON for a missing token", () => {
		const bookmarks = operation(doc, "/bookmark/{episodeId}", "put");
		expect(bookmarks.security).toEqual([{ bearerAuth: [] }]);
		expect(bookmarks.description).toMatch(/Any valid token/);
		expect(bookmarks.description).toMatch(/403/);
		expect(bookmarks.responses?.["401"]).toBeUndefined();
		expect(bookmarks.responses?.["403"]?.content?.["application/json"]).toBeTruthy();
		expect(bookmarks.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
	});

	it("names admin, curate-or-admin, and any-token episode read", () => {
		const remove = operation(doc, "/episode/{podcastId}/{episodeId}", "delete");
		expect(remove.responses?.["403"]?.description).toMatch(/`admin`/);
		const languages = operation(doc, "/languages", "get");
		expect(languages.description).toMatch(/`curate` or `admin`/);
		expect(languages.responses?.["404"]).not.toHaveProperty("content");
		const episode = operation(doc, "/public/episode/{id}", "get");
		expect(episode.security).toEqual([{ bearerAuth: [] }]);
		expect(episode.description).toMatch(/Any valid token/);
		expect(episode.responses?.["403"]).toBeUndefined();
		expect(episode.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
	});

	it("leaves the exported hero schema unchanged when the route is built", () => {
		expect(putHeroCurationOpenApiSchema.security).toBeUndefined();
		expect(putHeroCurationOpenApiSchema.description).not.toMatch(/Requires an Auth0 access token/);
		expect(putHeroCurationOpenApiSchema.responses?.[202]).toEqual({
			description: "Hero curation updated (empty body)"
		});
		expect(putHeroCurationOpenApiSchema.responses?.[409]).not.toHaveProperty("content");
		expect(PutHeroCurationRoute.openApiSchema).not.toBe(putHeroCurationOpenApiSchema);
		expect(PutHeroCurationRoute.openApiSchema.responses).not.toBe(putHeroCurationOpenApiSchema.responses);
		expect(PutHeroCurationRoute.openApiSchema.security).toEqual([{ bearerAuth: [] }]);
		expect(PutHeroCurationRoute.openApiSchema.description).toMatch(/Requires an Auth0 access token/);
		expect(PutHeroCurationRoute.openApiSchema.description).toMatch(/send null/);
	});

	it("keeps person create as an empty 202 and documents optional submit auth", () => {
		const create = operation(doc, "/person", "post");
		expect(create.responses?.["202"]).toEqual({ description: "Person created (empty body)" });
		expect(create.responses?.["202"]).not.toHaveProperty("content");
		expect(create.responses?.["409"]?.content?.["application/json"]).toBeTruthy();
		const submit = operation(doc, "/submit", "post");
		expect(submit.security).toEqual([{}, { bearerAuth: [] }]);
		expect(submit.description).toMatch(/Authentication is optional/);
		expect(submit.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
		const lookup = operation(doc, "/submit/lookup", "get");
		expect(lookup.security).toEqual([{ bearerAuth: [] }]);
		expect(lookup.responses?.["403"]?.description).toMatch(/without.*`submit` or `curate`/);
	});
});
