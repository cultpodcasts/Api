import { describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({
	ImageResponse: class ImageResponse {}
}));
import {
	appendHeroCurationEpisodesOpenApiSchema,
	deleteHeroCurationEpisodesOpenApiSchema,
	getHeroCurationOpenApiSchema,
	putHeroCurationOpenApiSchema
} from "../src/heroCurationOpenApi";
import {
	GetPodcastByNameAndEpisodeIdRoute,
	GetPodcastByNameRoute,
	SubmitLookupRoute,
	SubmitPrepareRoute,
	SubmitRoute
} from "../src/openapiSubmitPodcastRoutes";
import {
	heroCurationAppendRequestSchema,
	heroCurationDeleteEpisodesRequestSchema,
	heroCurationResponseSchema,
	heroCurationUpdateRequestSchema,
	searchForwardedErrorSchema,
	searchUpstreamErrorSchema,
	submitUrlLookupQuerySchema,
	submitUrlLookupResponseSchema,
	submitUrlRequestSchema
} from "../src/openapiSchemas";
import { getOgShareImageOpenApiSchema } from "../src/ogShareImageOpenApi";
import * as openapiRoutes from "../src/openapiRoutes";
import { SearchRoute } from "../src/openapiRoutes";
import * as openapiSubmitPodcastRoutes from "../src/openapiSubmitPodcastRoutes";
import { OPENAPI_TAG_ORDER, OpenApiTags, openApiTagDefinitions } from "../src/openapiTags";
import { streamingMembershipShapeCases } from "./fixtures/streaming-submit-contract";

type OpenApiRouteExport = {
	openApiSchema?: { tags?: readonly string[]; summary?: string };
};

function collectRouteTags(mod: Record<string, unknown>): { name: string; tags: readonly string[] }[] {
	const collected: { name: string; tags: readonly string[] }[] = [];
	for (const [name, value] of Object.entries(mod)) {
		if (!name.endsWith("Route") || value == null || typeof value !== "function") {
			continue;
		}
		const tags = (value as OpenApiRouteExport).openApiSchema?.tags;
		if (tags == null) {
			continue;
		}
		collected.push({ name, tags });
	}
	return collected;
}

/** Api #254: publish/move (and film-target attach / create-film) tags follow destination kind. */
const PUBLISH_MOVE_DESTINATION_TAGS: Record<string, string> = {
	PublishPodcastEpisodeRoute: OpenApiTags.Episodes,
	PublishEpisodeRoute: OpenApiTags.Episodes,
	PublishFilmRoute: OpenApiTags.Films,
	CreateFilmRoute: OpenApiTags.Films,
	PublishNewsReportRoute: OpenApiTags.NewsReports,
	PublishTvShowEpisodeRoute: OpenApiTags.TvShows,
	PublishHomepageRoute: OpenApiTags.Public,
	MoveEpisodeToFilmRoute: OpenApiTags.Films,
	MoveEpisodeToTvShowRoute: OpenApiTags.TvShows,
	MoveEpisodeToNewsRoute: OpenApiTags.NewsReports,
	MovePodcastEpisodesToNewsRoute: OpenApiTags.NewsReports,
	MoveNewsReportToTvShowRoute: OpenApiTags.TvShows,
	MoveNewsReportToFilmRoute: OpenApiTags.Films,
	MoveNewsOrganisationReportsRoute: OpenApiTags.NewsOrganisations,
	AttachEpisodeAsTrailerRoute: OpenApiTags.Films,
	AttachEpisodeYouTubeAlternateRoute: OpenApiTags.Episodes
};

describe("OpenAPI route contracts", () => {
	it("documents POST /search error statuses, the 502 envelope and Retry-After", () => {
		const responses = SearchRoute.openApiSchema.responses ?? {};
		for (const status of [200, 400, 429, 502, 503]) {
			expect(responses[status], `status ${status}`).toBeDefined();
		}
		const schema502 = (responses[502] as { content: { "application/json": { schema: unknown } } })
			.content["application/json"].schema;
		expect(schema502).toBe(searchUpstreamErrorSchema);
		expect(searchUpstreamErrorSchema.safeParse({
			error: { code: "UpstreamSearchError", message: "Upstream search unavailable" }
		}).success).toBe(true);
		expect(searchUpstreamErrorSchema.safeParse({ error: { code: "Other", message: "x" } }).success).toBe(false);
		expect(responses[429]?.description).toContain("Retry-After");
		expect(responses[503]?.description).toContain("Retry-After");
		expect(searchForwardedErrorSchema.safeParse({ error: "Bad request" }).success).toBe(true);
		expect(searchForwardedErrorSchema.safeParse({ error: { code: "", message: "Could not find a property named 'x'" } }).success).toBe(true);
	});


	it("shares one 409 UUID-array object across submit and GET podcast-by-name", () => {
		expect(SubmitRoute.openApiSchema.responses?.[409]).toBe(
			GetPodcastByNameRoute.openApiSchema.responses?.[409]
		);
		expect(GetPodcastByNameAndEpisodeIdRoute.openApiSchema.responses?.[409]).toBe(
			GetPodcastByNameRoute.openApiSchema.responses?.[409]
		);
	});

	it("documents POST /submit 400 for Azure binding / missing Url", () => {
		expect(SubmitRoute.openApiSchema.responses?.[400]).toEqual(
			expect.objectContaining({ description: expect.stringContaining("binding") })
		);
		expect(SubmitRoute.openApiSchema.responses?.[400]?.description).toEqual(
			expect.stringContaining("Url")
		);
		expect(SubmitRoute.openApiSchema.responses?.[400]?.description).not.toMatch(/name-only/i);
	});

	it("documents required url on POST /submit with optional attach-by-name fields", () => {
		const request = SubmitRoute.openApiSchema.request as
			| { body?: { content?: { "application/json"?: { schema?: unknown } } } }
			| undefined;
		expect(request?.body?.content?.["application/json"]?.schema).toBe(submitUrlRequestSchema);
		expect(
			submitUrlRequestSchema.parse({
				url: "https://example.com/ep",
				podcastName: "Shared Show Name"
			}).url
		).toContain("example.com");
		expect(() => submitUrlRequestSchema.parse({ podcastName: "Shared Show Name" })).toThrow();
	});

	it("documents GET /submit/lookup query url and 200 ambiguous membership", () => {
		expect(SubmitLookupRoute.openApiSchema.request?.query).toBe(submitUrlLookupQuerySchema);
		expect(SubmitLookupRoute.openApiSchema.description).toMatch(/ambiguous/i);
		expect(SubmitLookupRoute.openApiSchema.description).toMatch(/podcastName/i);
		expect(SubmitLookupRoute.openApiSchema.description).toMatch(/`service`/);
		expect(SubmitLookupRoute.openApiSchema.description).toMatch(/ServiceKeys/);
		expect(SubmitLookupRoute.openApiSchema.description).toMatch(/does not scrape/i);
		expect(SubmitLookupRoute.openApiSchema.description).toMatch(/submit/i);
		expect(SubmitLookupRoute.openApiSchema.description).toMatch(/curate/i);
		expect(SubmitLookupRoute.openApiSchema.responses?.[403]?.description).toMatch(
			/without.*submit.*curate/i
		);
		expect(SubmitLookupRoute.openApiSchema.responses?.[400]?.description).toMatch(
			/absolute http or https URL/i
		);
		expect(SubmitLookupRoute.openApiSchema.responses?.[404]?.description).toMatch(
			/api-infra before SubmitUrl lookup/i
		);
		const lookup200 = SubmitLookupRoute.openApiSchema.responses?.[200] as
			| { content?: { "application/json"?: { schema?: unknown } } }
			| undefined;
		expect(lookup200?.content?.["application/json"]?.schema).toBe(submitUrlLookupResponseSchema);
		expect(
			submitUrlLookupResponseSchema.parse({
				known: true,
				podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				podcastName: "Stored Show Name",
				kind: "podcast-service"
			}).known
		).toBe(true);
		expect(
			submitUrlLookupResponseSchema.parse({ known: false, kind: "streaming" })
		).toEqual({ known: false, kind: "streaming" });
		expect(
			submitUrlLookupResponseSchema.parse({
				known: false,
				kind: "streaming",
				podcastName: "Extracted Show"
			})
		).toEqual({
			known: false,
			kind: "streaming",
			podcastName: "Extracted Show"
		});
		const knownStreaming = streamingMembershipShapeCases.find(
			(c) => c.arm === "known" && c.service === "itvx"
		)!;
		const unknownStreaming = streamingMembershipShapeCases.find(
			(c) => c.arm === "unknown" && c.service === "discoveryPlus"
		)!;
		const ambiguousStreaming = streamingMembershipShapeCases.find(
			(c) => c.arm === "ambiguous" && c.service === "netflix"
		)!;
		expect(submitUrlLookupResponseSchema.parse(knownStreaming.body)).toEqual(knownStreaming.body);
		expect(submitUrlLookupResponseSchema.parse(unknownStreaming.body)).toEqual(
			unknownStreaming.body
		);
		expect(submitUrlLookupResponseSchema.parse(ambiguousStreaming.body)).toEqual(
			ambiguousStreaming.body
		);
		expect(() =>
			submitUrlLookupResponseSchema.parse({
				known: false,
				kind: "streaming",
				service: "spotify"
			})
		).toThrow();
		expect(
			submitUrlLookupResponseSchema.parse({
				known: false,
				ambiguous: true,
				podcastIds: [
					"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
					"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
				]
			}).ambiguous
		).toBe(true);
		expect(() =>
			submitUrlLookupResponseSchema.parse({
				known: true,
				ambiguous: true,
				podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				podcastName: "Stored Show Name"
			})
		).toThrow();
		expect(() => submitUrlLookupResponseSchema.parse({ known: false })).toThrow();
	});

	it("documents POST /submit/prepare BitChute video JSON then Azure extract", () => {
		const description = SubmitPrepareRoute.openApiSchema.description ?? "";
		expect(description).toMatch(/api\.bitchute\.com\/api\/beta\/video/);
		expect(description).toMatch(/SubmitUrl\/extract/);
		expect(description).toMatch(/browserRenderingServices/);
		expect(description).toMatch(/SubmitUrl\/prepare/);
		expect(description).toMatch(/fetch\/extract miss/i);
		expect(description).toMatch(/Tubi/);
		expect(description).toMatch(/catalogue HTML/);
	});

	it("documents hero curation as one resource: GET is the document, commands are empty acknowledgements", () => {
		for (const schema of [
			getHeroCurationOpenApiSchema,
			putHeroCurationOpenApiSchema,
			appendHeroCurationEpisodesOpenApiSchema,
			deleteHeroCurationEpisodesOpenApiSchema
		]) {
			expect(schema.tags).toEqual([OpenApiTags.Hero]);
		}

		expect(getHeroCurationOpenApiSchema.description).toMatch(/Query/);
		expect(getHeroCurationOpenApiSchema.description).toMatch(/No authentication/);
		expect(getHeroCurationOpenApiSchema.description).toMatch(/max-age=60/);
		const getOk = getHeroCurationOpenApiSchema.responses?.[200] as {
			content?: { "application/json"?: { schema?: unknown } };
		};
		expect(getOk.content?.["application/json"]?.schema).toBe(heroCurationResponseSchema);

		expect(putHeroCurationOpenApiSchema.description).toMatch(/Command/);
		expect(putHeroCurationOpenApiSchema.description).toMatch(/curate/);
		expect(putHeroCurationOpenApiSchema.description).toMatch(/expectedUpdatedAt/);
		expect(putHeroCurationOpenApiSchema.description).toMatch(/send null/);
		expect(putHeroCurationOpenApiSchema.description).toMatch(/GET \/hero-curation/);
		expect(putHeroCurationOpenApiSchema.responses?.[202]).toEqual({
			description: "Hero curation updated (empty body)"
		});
		expect(putHeroCurationOpenApiSchema.responses?.[409]).toEqual({
			description: "Compare-and-swap lost (empty body)"
		});
		expect(putHeroCurationOpenApiSchema.responses?.[202]).not.toHaveProperty("content");
		expect(putHeroCurationOpenApiSchema.responses?.[409]).not.toHaveProperty("content");

		expect(appendHeroCurationEpisodesOpenApiSchema.responses?.[202]).toEqual({
			description: "Hero episodes appended (empty body)"
		});
		expect(appendHeroCurationEpisodesOpenApiSchema.responses?.[202]).not.toHaveProperty("content");
		expect(deleteHeroCurationEpisodesOpenApiSchema.responses?.[202]).toEqual({
			description: "Hero episodes removed (empty body)"
		});
		expect(deleteHeroCurationEpisodesOpenApiSchema.responses?.[202]).not.toHaveProperty("content");

		const putBody = putHeroCurationOpenApiSchema.request?.body as {
			content?: { "application/json"?: { schema?: unknown } };
		};
		expect(putBody.content?.["application/json"]?.schema).toBe(heroCurationUpdateRequestSchema);
		expect(heroCurationUpdateRequestSchema.shape.expectedUpdatedAt.description).toMatch(/409/);
		expect(heroCurationUpdateRequestSchema.shape.expectedUpdatedAt.description).toMatch(/send null/);
		expect(heroCurationAppendRequestSchema.shape.episodeIds.description).toMatch(/front/);
		expect(heroCurationDeleteEpisodesRequestSchema.shape.episodeIds.description).toMatch(/ignored/);
		expect(heroCurationResponseSchema.shape.updatedAt.description).toMatch(/compare-and-swap/);
	});

	it("places every route under the Api #254 tag set and locks publish/move destinations", () => {
		expect(OPENAPI_TAG_ORDER).toEqual([
			"Public",
			"Search",
			"Submission",
			"Podcasts",
			"Episodes",
			"Films",
			"TV shows",
			"News organisations",
			"News reports",
			"People",
			"Subjects",
			"Discovery",
			"Hero",
			"Bookmarks",
			"Notifications",
			"Metadata",
			"Ops"
		]);
		expect(OPENAPI_TAG_ORDER).toEqual(openApiTagDefinitions.map((t) => t.name));
		expect([...Object.values(OpenApiTags)].sort()).toEqual([...OPENAPI_TAG_ORDER].sort());
		const allowed = new Set(OPENAPI_TAG_ORDER);
		for (const forbidden of ["Catalogue", "Admin", "Publishing", "Hero curation"]) {
			expect(allowed.has(forbidden)).toBe(false);
		}

		const routeTagRows = [
			...collectRouteTags(openapiRoutes as Record<string, unknown>),
			...collectRouteTags(openapiSubmitPodcastRoutes as Record<string, unknown>)
		];
		expect(routeTagRows.length).toBeGreaterThan(50);

		for (const { name, tags } of routeTagRows) {
			expect(tags.length, name).toBeGreaterThan(0);
			for (const tag of tags) {
				expect(allowed.has(tag), `${name} tag "${tag}"`).toBe(true);
			}
		}

		for (const schema of [
			getHeroCurationOpenApiSchema,
			putHeroCurationOpenApiSchema,
			appendHeroCurationEpisodesOpenApiSchema,
			deleteHeroCurationEpisodesOpenApiSchema,
			getOgShareImageOpenApiSchema
		]) {
			expect(schema.tags?.length).toBeGreaterThan(0);
			for (const tag of schema.tags ?? []) {
				expect(allowed.has(tag), `schema tag "${tag}"`).toBe(true);
			}
		}

		const byName = new Map(routeTagRows.map((row) => [row.name, row.tags]));
		for (const [routeName, expectedTag] of Object.entries(PUBLISH_MOVE_DESTINATION_TAGS)) {
			expect(byName.has(routeName), `missing ${routeName}`).toBe(true);
			expect(byName.get(routeName), routeName).toEqual([expectedTag]);
		}

		const publishOrMoveExports = routeTagRows
			.map((row) => row.name)
			.filter((name) => /^(Publish|Move|CreateFilm)/.test(name) || name.startsWith("AttachEpisode"));
		expect(publishOrMoveExports.sort()).toEqual(Object.keys(PUBLISH_MOVE_DESTINATION_TAGS).sort());
	});
});
