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

	it("pins a kind hold on apply and retry 200 command outcomes", () => {
		const submissionId = "550e8400-e29b-41d4-a716-446655440000";
		const itemId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
		const body = {
			submissionId,
			status: "Pending",
			etag: "etag",
			message: "A kind decision is required before anything is created.",
			outcome: {
				message: "Kind decision required",
				errorsOccurred: false,
				results: [],
				kindDecisionsRequired: [{
					discoveryItemId: itemId,
					target: "film",
					query: "Father's House",
					candidates: [{
						key: "tmdb:1",
						title: "Father's House",
						kind: "Film",
						source: "tmdb",
						year: 2020
					}]
				}]
			}
		};
		expect(responseSchema(routes.apply, 200).parse(body)).toMatchObject({
			outcome: { kindDecisionsRequired: [{ discoveryItemId: itemId }] }
		});
		expect(responseSchema(routes.retry, 200).parse(body)).toMatchObject({
			outcome: { kindDecisionsRequired: [{ discoveryItemId: itemId }] }
		});
	});
});
