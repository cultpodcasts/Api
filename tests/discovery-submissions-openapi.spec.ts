import { describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({
	ImageResponse: class ImageResponse {}
}));

import {
	PostDiscoverySubmissionApplyRoute,
	PostDiscoverySubmissionStateRoute,
	PostDiscoverySubmissionReleaseRoute,
	PostDiscoverySubmissionRetryRoute,
	PutDiscoverySubmissionReviewRoute
} from "../src/openapiRoutes";

describe("discovery submission command route error schemas", () => {
	const id = "550e8400-e29b-41d4-a716-446655440000";
	const routes = {
		review: PutDiscoverySubmissionReviewRoute,
		apply: PostDiscoverySubmissionApplyRoute,
		retry: PostDiscoverySubmissionRetryRoute,
		release: PostDiscoverySubmissionReleaseRoute,
		state: PostDiscoverySubmissionStateRoute
	};

	function responseSchema(route: { openApiSchema: any }, status: number): { parse: (v: unknown) => unknown } {
		return route.openApiSchema.responses[status].content["application/json"].schema;
	}

	for (const [name, route] of Object.entries(routes)) {
		for (const status of [400, 404, 409]) {
			it(`${name} ${status} accepts the command outcome and the error shape`, () => {
				const command = { submissionId: id, status: "Pending", etag: "\"e\"", message: "stale etag", ids: [id] };
				expect(responseSchema(route, status).parse(command)).toEqual(command);
				expect(responseSchema(route, status).parse({ error: "Error" })).toEqual({ error: "Error" });
				expect(responseSchema(route, status).parse({ message: "Not found" })).toEqual({ message: "Not found" });
			});
		}
	}
});
