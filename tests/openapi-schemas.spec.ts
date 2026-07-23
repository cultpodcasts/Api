import { describe, expect, it } from "vitest";
import {
	discoverySubmitRequestSchema,
	podcastRenameRequestSchema,
	searchRequestSchema,
	submitUrlRequestSchema
} from "../src/openapiSchemas";

describe("openapi Zod schemas", () => {
	it("accepts discovery submit body matching Azure DiscoverySubmitRequest", () => {
		const parsed = discoverySubmitRequestSchema.parse({
			ids: ["550e8400-e29b-41d4-a716-446655440000"],
			resultIds: ["6ba7b810-9dad-11d1-80b4-00c04fd430c8"]
		});
		expect(parsed.ids).toHaveLength(1);
		expect(parsed.resultIds).toHaveLength(1);
	});

	it("accepts search and submit-url request shapes", () => {
		expect(searchRequestSchema.parse({ search: "cult", orderby: "release desc" }).search).toBe("cult");
		expect(submitUrlRequestSchema.parse({ url: "https://example.com/ep" }).url).toContain("example.com");
		expect(podcastRenameRequestSchema.parse({ newPodcastName: "New Name" }).newPodcastName).toBe("New Name");
	});

	it("rejects discovery submit without uuid arrays", () => {
		expect(() => discoverySubmitRequestSchema.parse({ ids: ["not-a-uuid"], resultIds: [] })).toThrow();
	});
});
