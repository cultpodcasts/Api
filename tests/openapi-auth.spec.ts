import { fromHono } from "chanfana";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({
	ImageResponse: class ImageResponse {}
}));

import {
	annotationFromOpenApiOperation,
	authAnnotationsEqual,
	type OpenApiAuthAnnotation
} from "../src/openapiAuth";
import { putHeroCurationOpenApiSchema } from "../src/heroCurationOpenApi";
import {
	AddBookmarkRoute,
	AttachEpisodeAsTrailerRoute,
	AttachEpisodeAsTvShowTrailerRoute,
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
import { registerOpenApiRoutes, toOpenApiPath } from "../src/registerOpenApiRoutes";
import { SEARCH_INDEX_WRITE_PERMISSION } from "../src/searchIndexWritePermission";
import { SubmitLookupRoute, SubmitRoute } from "../src/openapiSubmitPodcastRoutes";

type OpenApiDoc = {
	components?: { securitySchemes?: Record<string, { type?: string; scheme?: string }> };
	paths?: Record<string, Record<string, unknown>>;
};

function operation(doc: OpenApiDoc, path: string, method: string) {
	return doc.paths?.[path]?.[method] as {
		security?: unknown;
		description?: string;
		responses?: Record<string, { description?: string; content?: Record<string, unknown> }>;
	};
}

function buildFullOpenApi() {
	const app = new Hono();
	const api = fromHono(app, {
		docs_url: null,
		schema: { info: { title: "Cult Podcasts API", version: "0" } }
	});
	registerBearerAuthScheme(
		(api as unknown as { registry: Parameters<typeof registerBearerAuthScheme>[0] }).registry
	);
	const registered = registerOpenApiRoutes(api);
	const doc = (api as unknown as { schema: OpenApiDoc }).schema;
	return { doc, registered };
}

/**
 * Runtime access for each published operation (Api #255 audit).
 * OpenAPI security / descriptions / 401·403 must match this map — not ID-token roles.
 *
 * Scope: locks OpenAPI document annotations and `route.authAnnotation` to this map.
 * Handler-gate drift (e.g. a route switching from signed-in to hasPermission without
 * updating createOpenApiRoute({ auth })) is out of scope here — cover that in
 * auth-matrix / handler behavioural specs.
 */
const runtimeAuthByOpenApiPath: Record<string, OpenApiAuthAnnotation> = {
	"get /homepage": { kind: "public" },
	"get /homepage-ssr": { kind: "public" },
	"get /search-suggestions": { kind: "public" },
	"post /search": { kind: "public" },
	"get /hero-curation": { kind: "public" },
	"get /pagedetails/{podcastName}/{episodeId}": { kind: "public" },
	"get /og-image": { kind: "public" },

	"post /submit": { kind: "optional-submit" },

	"get /public/episode/{id}": { kind: "signed-in", unauthenticatedStatus: 401 },
	"put /bookmark/{episodeId}": { kind: "signed-in", unauthenticatedStatus: 403 },
	"delete /bookmark/{episodeId}": { kind: "signed-in", unauthenticatedStatus: 403 },
	"get /bookmarks": { kind: "signed-in", unauthenticatedStatus: 403 },

	"get /subjects": {
		kind: "authorised",
		anyOf: ["curate"],
		claims: ["permissions"],
		unauthenticatedStatus: 401
	},
	"get /people": {
		kind: "authorised",
		anyOf: ["curate"],
		claims: ["permissions"],
		unauthenticatedStatus: 401
	},
	"get /flairs": {
		kind: "authorised",
		anyOf: ["curate"],
		claims: ["permissions"],
		unauthenticatedStatus: 401
	},
	"get /discovery-info": {
		kind: "authorised",
		anyOf: ["curate"],
		claims: ["permissions"],
		unauthenticatedStatus: 401
	},

	"get /languages": {
		kind: "authorised",
		anyOf: ["curate", "admin"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},

	"get /submit/lookup": {
		kind: "authorised",
		anyOf: ["submit", "curate"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},
	"post /submit/prepare": {
		kind: "authorised",
		anyOf: ["submit", "curate"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},
	"post /ops/streaming-scrape-survey": {
		kind: "authorised",
		anyOf: ["submit", "curate"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},

	"post /search/admin/docs": {
		kind: "authorised",
		anyOf: [SEARCH_INDEX_WRITE_PERMISSION],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},
	"get /search/admin/docs/inventory": {
		kind: "authorised",
		anyOf: [SEARCH_INDEX_WRITE_PERMISSION],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},
	"get /search/admin/rebuild": {
		kind: "authorised",
		anyOf: [SEARCH_INDEX_WRITE_PERMISSION],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},
	"post /search/admin/rebuild/{action}": {
		kind: "authorised",
		anyOf: [SEARCH_INDEX_WRITE_PERMISSION],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},

	"get /discovery-submissions": {
		kind: "authorised",
		anyOf: ["supervise", "admin", "curate:supervised"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},
	"get /discovery-submissions/{id}": {
		kind: "authorised",
		anyOf: ["supervise", "admin", "curate:supervised"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},
	"put /discovery-submissions/{id}/review": {
		kind: "authorised",
		anyOf: ["supervise", "admin"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},
	"post /discovery-submissions/{id}/apply": {
		kind: "authorised",
		anyOf: ["supervise", "admin"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},
	"post /discovery-submissions/{id}/retry": {
		kind: "authorised",
		anyOf: ["supervise", "admin"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},
	"post /discovery-submissions/{id}/release": {
		kind: "authorised",
		anyOf: ["supervise", "admin"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},
	"post /discovery-submissions/{id}/state": {
		kind: "authorised",
		anyOf: ["admin"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	},
	"post /discovery-reports/{id}/release": {
		kind: "authorised",
		anyOf: ["admin"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	}
};

const curatePaths = [
	"get /person/{name}",
	"patch /person/{id}",
	"post /person",
	"get /episode/{id}",
	"get /episode/{podcastName}/{episodeId}",
	"patch /episode/{podcastId}/{episodeId}",
	"post /episode/publish/{podcastId}/{episodeId}",
	"post /episode/publish/{episodeId}",
	"post /film/{id}/publish",
	"post /newsreport/{id}/publish",
	"post /tvshowepisode/{id}/publish",
	"post /episode/{podcastId}/{episodeId}/film",
	"post /episode/{podcastId}/{episodeId}/trailer",
	"post /episode/{podcastId}/{episodeId}/tvshow-trailer",
	"post /episode/{podcastId}/{episodeId}/youtube-alternate",
	"post /episode/{podcastId}/{episodeId}/tvshow",
	"post /episode/{podcastId}/{episodeId}/news",
	"get /episodes/outgoing",
	"get /episodes/awaiting-approval",
	"get /podcast/{name}",
	"get /podcast/{name}/{id}",
	"post /podcast/{id}/kind",
	"get /podcast/{id}/kind",
	"patch /podcast/{id}",
	"get /tvshow/{identifier}{.+}",
	"patch /tvshow/{id}",
	"get /tvshowepisode/{id}",
	"patch /tvshowepisode/{id}",
	"get /film/{identifier}{.+}",
	"patch /film/{id}",
	"post /catalogue/identity/lookup",
	"get /newsorganisation/{identifier}{.+}",
	"patch /newsorganisation/{id}",
	"post /newsorganisation/{id}/reports/move",
	"post /newsorganisation/index/{identifier}{.+}",
	"post /tvshow/index/{identifier}{.+}",
	"get /newsreport/{id}",
	"patch /newsreport/{id}",
	"post /newsreport/{id}/tvshow",
	"post /newsreport/{id}/film",
	"post /podcast/index/{name}",
	"get /subject/{name}",
	"patch /subject/{id}",
	"post /subject",
	"get /discovery-curation",
	"post /discovery-curation",
	"post /discovery-curation/submit-outcome",
	"post /discovery-curation/{resultId}/ban",
	"get /discovery-curation/session",
	"post /discovery-curation/session/vote",
	"post /discovery-curation/session/sync-documents",
	"post /discovery-curation/session/include",
	"post /discovery-curation/session/clear-votes",
	"get /discovery-curation/session/ws",
	"put /hero-curation",
	"post /hero-curation/episodes",
	"delete /hero-curation/episodes",
	"post /podcast/{id}/news"
] as const;

const adminPaths = [
	"delete /episode/{podcastId}/{episodeId}",
	"delete /tvshowepisode/{id}",
	"delete /film/{id}",
	"delete /newsorganisation/{id}",
	"delete /newsreport/{id}",
	"post /searchindex/run",
	"post /publish/homepage",
	"get /discovery-schedule",
	"put /discovery-schedule",
	"get /supported-languages",
	"get /supported-languages/cultures",
	"post /supported-languages",
	"delete /supported-languages/{code}",
	"get /title-casing-rules/{language}",
	"post /title-casing-rules/{language}/lower-case-terms",
	"delete /title-casing-rules/{language}/lower-case-terms/{term}",
	"put /title-casing-rules/{language}/known-terms/{literal}",
	"delete /title-casing-rules/{language}/known-terms/{literal}",
	"post /title-casing-rules/{language}/ignored-subjects",
	"delete /title-casing-rules/{language}/ignored-subjects/{term}",
	"post /podcast/name/{name}",
	"post /newsorganisation/name/{identifier}{.+}",
	"post /tvshow/name/{identifier}{.+}",
	"post /film/name/{identifier}{.+}",
	"post /pushsubscription",
	"get /podcast/index/{name}/backlog/preview",
	"post /podcast/index/{name}/backlog"
] as const;

for (const key of curatePaths) {
	runtimeAuthByOpenApiPath[key] = {
		kind: "authorised",
		anyOf: ["curate"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	};
}
for (const key of adminPaths) {
	runtimeAuthByOpenApiPath[key] = {
		kind: "authorised",
		anyOf: ["admin"],
		claims: ["permissions", "scope"],
		unauthenticatedStatus: 401
	};
}

describe("OpenAPI auth and response contracts", () => {
	const { doc, registered } = buildFullOpenApi();

	it("registers every operation in the runtime auth matrix exactly once", () => {
		const keys = registered.map((r) => `${r.method} ${r.openApiPath}`);
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys.sort()).toEqual(Object.keys(runtimeAuthByOpenApiPath).sort());
	});

	it("documents each operation's public / signed-in / authorised annotation to match runtime", () => {
		const mismatches: string[] = [];
		for (const entry of registered) {
			const key = `${entry.method} ${entry.openApiPath}`;
			const expected = runtimeAuthByOpenApiPath[key];
			const op = operation(doc, entry.openApiPath, entry.method);
			expect(op, `missing OpenAPI operation ${key}`).toBeTruthy();
			const fromDoc = annotationFromOpenApiOperation(op);
			const fromRoute = entry.authAnnotation;
			if (!authAnnotationsEqual(fromRoute, expected)) {
				mismatches.push(`${key}: route authAnnotation ${JSON.stringify(fromRoute)} != runtime ${JSON.stringify(expected)}`);
			}
			if (!authAnnotationsEqual(fromDoc, expected)) {
				mismatches.push(`${key}: OpenAPI ${JSON.stringify(fromDoc)} != runtime ${JSON.stringify(expected)}`);
			}
			if (expected.kind === "public") {
				expect(op.security).toEqual([]);
				expect(op.responses?.["401"]).toBeUndefined();
				expect(op.responses?.["403"]).toBeUndefined();
			} else if (expected.kind === "optional-submit") {
				expect(op.security).toEqual([{}, { bearerAuth: [] }]);
				expect(op.description).toMatch(/Authentication is optional/);
				expect(op.responses?.["401"]?.content?.["application/json"]).toBeTruthy();
				expect(op.responses?.["403"]?.description).toMatch(/`submit` or `curate`/);
			} else if (expected.kind === "signed-in") {
				expect(op.security).toEqual([{ bearerAuth: [] }]);
				expect(op.description).toMatch(/Any valid token is enough/);
				if (expected.unauthenticatedStatus === 401) {
					expect(op.responses?.["401"]?.content?.["application/json"]).toBeTruthy();
					expect(op.responses?.["403"]).toBeUndefined();
				} else {
					expect(op.responses?.["401"]).toBeUndefined();
					expect(op.responses?.["403"]?.content?.["application/json"]).toBeTruthy();
				}
			} else {
				expect(op.security).toEqual([{ bearerAuth: [] }]);
				expect(op.description).toMatch(/Requires an Auth0 access token/);
				for (const permission of expected.anyOf) {
					expect(op.description).toContain(`\`${permission}\``);
				}
				if (expected.claims.length === 1 && expected.claims[0] === "permissions") {
					expect(op.description).toMatch(/scope` value alone is not accepted/);
				} else {
					expect(op.description).toMatch(/permissions` array or the space-delimited `scope` claim/);
				}
				expect(op.responses?.["401"]?.content?.["application/json"]).toBeTruthy();
				expect(op.responses?.["403"]?.description).toMatch(/without/);
			}
		}
		expect(mismatches).toEqual([]);
	});

	it("maps Hono :param{.+} paths to OpenAPI {param} templates", () => {
		expect(toOpenApiPath("/tvshow/:identifier{.+}")).toBe("/tvshow/{identifier}{.+}");
		expect(toOpenApiPath("/episode/:podcastId/:episodeId")).toBe("/episode/{podcastId}/{episodeId}");
	});

	it("documents attach-as-trailer createFilm in the request body and the 200 identity prompt (#1418)", () => {
		const attach = operation(doc, "/episode/{podcastId}/{episodeId}/trailer", "post") as ReturnType<
			typeof operation
		> & {
			requestBody?: { content?: Record<string, unknown> };
		};
		const body = JSON.stringify(attach.requestBody?.content?.["application/json"]);
		expect(body).toMatch(/"createFilm"/);
		expect(body).toMatch(/"filmName"/);
		expect(body).toMatch(/"selectedIdentityKey"/);
		expect(JSON.stringify(attach.responses?.["200"]?.content?.["application/json"])).toMatch(/"identityDecision"/);
		expect(JSON.stringify(attach.responses?.["202"]?.content?.["application/json"])).toMatch(/"filmCreated"/);
	});

	it("documents attach-as-TV-show-trailer createShow, tvShowName and publisher in the request, showCreated in the 202 and the existing show id in the 409 (#1412)", () => {
		const attach = operation(doc, "/episode/{podcastId}/{episodeId}/tvshow-trailer", "post") as ReturnType<
			typeof operation
		> & {
			requestBody?: { content?: Record<string, unknown> };
		};
		const body = JSON.stringify(attach.requestBody?.content?.["application/json"]);
		for (const key of ["tvShowId", "createShow", "tvShowName", "publisher", "title"]) {
			expect(body).toContain(`"${key}"`);
		}
		expect(JSON.stringify(attach.responses?.["202"]?.content?.["application/json"])).toContain('"showCreated"');
		expect(JSON.stringify(attach.responses?.["409"]?.content?.["application/json"])).toContain('"tvShowId"');
	});

	it("documents PATCH /tvshow trailers and expectedTrailerIds in the request and both 409 conflict shapes (#1412)", () => {
		const patch = operation(doc, "/tvshow/{id}", "patch") as ReturnType<typeof operation> & {
			requestBody?: { content?: Record<string, unknown> };
		};
		const body = JSON.stringify(patch.requestBody?.content?.["application/json"]);
		expect(body).toContain('"trailers"');
		expect(body).toContain('"expectedTrailerIds"');
		const conflict = JSON.stringify(patch.responses?.["409"]?.content?.["application/json"]);
		expect(conflict).toContain('"ids"');
		expect(conflict).toContain('"unexpectedTrailerIds"');
	});

	it("documents GET /tvshow trailers in the 200 body (#1412)", () => {
		const get = operation(doc, "/tvshow/{identifier}{.+}", "get");
		expect(JSON.stringify(get.responses?.["200"]?.content?.["application/json"])).toContain('"trailers"');
	});

	it("documents POST /search/admin/docs as an M2M write:search-index command with the search Worker's envelopes (SP-1.4)", () => {
		const admin = operation(doc, "/search/admin/docs", "post");
		expect(admin.security).toEqual([{ bearerAuth: [] }]);
		expect(admin.description).toMatch(/M2M \(client_credentials\) token with `write:search-index`/);
		expect(admin.responses?.["403"]?.description).toBe(
			"Forbidden — authenticated without `write:search-index`"
		);
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
		expect(inventory.responses?.["403"]?.description).toBe(
			"Forbidden — authenticated without `write:search-index`"
		);
		expect(inventory.parameters?.filter((p) => p.in === "query").map((p) => p.name).sort()).toEqual([
			"after",
			"limit"
		]);
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
			expect(op.responses?.["403"]?.description).toBe(
				"Forbidden — authenticated without `write:search-index`"
			);
		}
		expect(rebuild.parameters?.find((p) => p.in === "path")?.schema?.enum).toEqual([
			"start",
			"docs",
			"swap",
			"check",
			"finish",
			"swap-back",
			"abort"
		]);
		expect(JSON.stringify(rebuild.responses?.["409"]?.content?.["application/json"])).toMatch(
			/VerificationFailed/
		);
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
		expect(GetPeopleRoute.authAnnotation).toEqual({
			kind: "authorised",
			anyOf: ["curate"],
			claims: ["permissions"],
			unauthenticatedStatus: 401
		});
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
		expect(HomepageRoute.authAnnotation).toEqual({ kind: "public" });
	});

	it("documents bookmark save as any token, with 403 and JSON for a missing token", () => {
		const bookmarks = operation(doc, "/bookmark/{episodeId}", "put");
		expect(bookmarks.security).toEqual([{ bearerAuth: [] }]);
		expect(bookmarks.description).toMatch(/Any valid token/);
		expect(bookmarks.description).toMatch(/403/);
		expect(bookmarks.responses?.["401"]).toBeUndefined();
		expect(bookmarks.responses?.["403"]?.content?.["application/json"]).toBeTruthy();
		expect(bookmarks.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
		expect(AddBookmarkRoute.authAnnotation).toEqual({
			kind: "signed-in",
			unauthenticatedStatus: 403
		});
	});

	it("names admin, curate-or-admin, and any-token episode read", () => {
		const remove = operation(doc, "/episode/{podcastId}/{episodeId}", "delete");
		expect(remove.responses?.["403"]?.description).toMatch(/`admin`/);
		expect(DeletePodcastEpisodeRoute.authAnnotation).toEqual({
			kind: "authorised",
			anyOf: ["admin"],
			claims: ["permissions", "scope"],
			unauthenticatedStatus: 401
		});
		const languages = operation(doc, "/languages", "get");
		expect(languages.description).toMatch(/`curate` or `admin`/);
		expect(languages.responses?.["404"]).not.toHaveProperty("content");
		expect(GetLanguagesRoute.authAnnotation).toEqual({
			kind: "authorised",
			anyOf: ["curate", "admin"],
			claims: ["permissions", "scope"],
			unauthenticatedStatus: 401
		});
		const episode = operation(doc, "/public/episode/{id}", "get");
		expect(episode.security).toEqual([{ bearerAuth: [] }]);
		expect(episode.description).toMatch(/Any valid token/);
		expect(episode.responses?.["403"]).toBeUndefined();
		expect(episode.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
		expect(PublicGetEpisodeRoute.authAnnotation).toEqual({
			kind: "signed-in",
			unauthenticatedStatus: 401
		});
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
		expect(CreatePersonRoute.authAnnotation.kind).toBe("authorised");
		const submit = operation(doc, "/submit", "post");
		expect(submit.security).toEqual([{}, { bearerAuth: [] }]);
		expect(submit.description).toMatch(/Authentication is optional/);
		expect(submit.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
		expect(submit.responses?.["403"]?.description).toMatch(/`submit` or `curate`/);
		expect(SubmitRoute.authAnnotation).toEqual({ kind: "optional-submit" });
		const lookup = operation(doc, "/submit/lookup", "get");
		expect(lookup.security).toEqual([{ bearerAuth: [] }]);
		expect(lookup.responses?.["403"]?.description).toMatch(/without.*`submit` or `curate`/);
		expect(SubmitLookupRoute.authAnnotation).toEqual({
			kind: "authorised",
			anyOf: ["submit", "curate"],
			claims: ["permissions", "scope"],
			unauthenticatedStatus: 401
		});
	});

	it("keeps discovery-schedule admin in the matrix (sample of schedule route class)", () => {
		expect(GetDiscoveryScheduleRoute.authAnnotation).toEqual({
			kind: "authorised",
			anyOf: ["admin"],
			claims: ["permissions", "scope"],
			unauthenticatedStatus: 401
		});
		expect(AttachEpisodeAsTvShowTrailerRoute.authAnnotation).toEqual({
			kind: "authorised",
			anyOf: ["curate"],
			claims: ["permissions", "scope"],
			unauthenticatedStatus: 401
		});
		expect(AttachEpisodeAsTrailerRoute.authAnnotation).toEqual({
			kind: "authorised",
			anyOf: ["curate"],
			claims: ["permissions", "scope"],
			unauthenticatedStatus: 401
		});
		for (const route of [
			SearchAdminDocsRoute,
			SearchAdminInventoryRoute,
			SearchAdminRebuildRoute,
			SearchAdminRebuildStatusRoute
		]) {
			expect(route.authAnnotation).toEqual({
				kind: "authorised",
				anyOf: [SEARCH_INDEX_WRITE_PERMISSION],
				claims: ["permissions", "scope"],
				unauthenticatedStatus: 401
			});
		}
	});
});

