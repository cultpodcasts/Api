import { contentJson } from "chanfana";
import { getPodcastByName } from "./getPodcastByName";
import { getPodcastByNameAndEpisodeId } from "./getPodcastByNameAndEpisodeId";
import {
	ambiguousPodcastNameConflict,
	authResponses,
	createOpenApiRoute,
	nameParam,
	notFoundResponse,
	podcastNameAndIdParam,
	serverErrorResponse
} from "./openapiRouteFactory";
import {
	errorSchema,
	jsonBody,
	podcastDtoSchema,
	submitUrlRequestSchema,
	submitUrlResponseSchema,
	submitUrlLookupQuerySchema,
	submitUrlLookupResponseSchema
} from "./openapiSchemas";
import { submit } from "./submit";
import { submitLookup } from "./submitLookup";

export const SubmitRoute = createOpenApiRoute(submit, {
	auth: true,
	schema: {
		tags: ["Submission"],
		summary: "Submit episode URL",
		request: { body: jsonBody(submitUrlRequestSchema) },
		responses: {
			200: { description: "Submission accepted", ...contentJson(submitUrlResponseSchema) },
			400: {
				description:
					"Bad request — missing or invalid Url, Azure SubmitUrl binding failure, or missing url on D1 fallback",
				...contentJson(errorSchema)
			},
			409: ambiguousPodcastNameConflict,
			...notFoundResponse,
			...serverErrorResponse,
			...authResponses
		}
	}
});

export const SubmitLookupRoute = createOpenApiRoute(submitLookup, {
	auth: true,
	schema: {
		tags: ["Submission"],
		summary: "Look up series membership for an episode URL",
		description:
			"Read-only Cosmos URL membership. Requires JWT `submit` or `curate` permission (unsigned is 401). " +
			"200 with known true when one series already stores the URL. " +
			"Unknown URLs return known false and kind podcast-service, streaming, or unrecognised; unknown streaming " +
			"may include scraped podcastName when Isolated extracted a series title. " +
			"When the same URL is stored on more than one podcast, 200 with known false, ambiguous true, and podcastIds " +
			"(not 409) so the client can still show Series.",
		request: {
			query: submitUrlLookupQuerySchema
		},
		responses: {
			200: {
				description: "Lookup result (known, unknown, or ambiguous)",
				...contentJson(submitUrlLookupResponseSchema)
			},
			400: {
				description: "Url must be an absolute http or https URL",
				...contentJson(errorSchema)
			},
			404: {
				description:
					"Azure GET /api/SubmitUrl not found (api-infra before SubmitUrl lookup). Not a Cosmos miss.",
				...contentJson(errorSchema)
			},
			...serverErrorResponse,
			...authResponses,
			403: {
				description:
					"Forbidden — authenticated without `submit` or `curate` permission",
				...contentJson(errorSchema)
			}
		}
	}
});

export const GetPodcastByNameRoute = createOpenApiRoute(getPodcastByName, {
	auth: true,
	schema: {
		tags: ["Podcasts"],
		summary: "Get podcast by name",
		request: { params: nameParam },
		responses: {
			200: { description: "Podcast", ...contentJson(podcastDtoSchema) },
			409: ambiguousPodcastNameConflict,
			...notFoundResponse,
			...serverErrorResponse,
			...authResponses
		}
	}
});

export const GetPodcastByNameAndEpisodeIdRoute = createOpenApiRoute(getPodcastByNameAndEpisodeId, {
	auth: true,
	schema: {
		tags: ["Podcasts"],
		summary: "Get podcast by name and episode id",
		request: { params: podcastNameAndIdParam },
		responses: {
			200: { description: "Podcast", ...contentJson(podcastDtoSchema) },
			409: ambiguousPodcastNameConflict,
			...notFoundResponse,
			...serverErrorResponse,
			...authResponses
		}
	}
});
