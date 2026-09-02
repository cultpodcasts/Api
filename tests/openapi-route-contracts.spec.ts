import { describe, expect, it } from "vitest";
import {
	GetPodcastByNameAndEpisodeIdRoute,
	GetPodcastByNameRoute,
	SubmitRoute
} from "../src/openapiSubmitPodcastRoutes";
import { submitUrlRequestSchema } from "../src/openapiSchemas";

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
});
