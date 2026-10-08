import { describe, expect, it } from "vitest";
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
	submitUrlLookupQuerySchema,
	submitUrlLookupResponseSchema,
	submitUrlRequestSchema
} from "../src/openapiSchemas";
import { streamingMembershipShapeCases } from "./fixtures/streaming-submit-contract";

describe("OpenAPI route contracts", () => {
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
			expect(schema.tags).toEqual(["Hero curation"]);
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
});
