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

	it("documents name-only POST /submit (url not required when podcastName is set)", () => {
		const request = SubmitRoute.openApiSchema.request as
			| { body?: { content?: { "application/json"?: { schema?: unknown } } } }
			| undefined;
		expect(request?.body?.content?.["application/json"]?.schema).toBe(submitUrlRequestSchema);
		expect(submitUrlRequestSchema.parse({ podcastName: "Shared Show Name" }).podcastName).toBe(
			"Shared Show Name"
		);
	});
});
