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
	jsonBody,
	podcastDtoSchema,
	submitUrlRequestSchema,
	submitUrlResponseSchema
} from "./openapiSchemas";
import { submit } from "./submit";

export const SubmitRoute = createOpenApiRoute(submit, {
	auth: true,
	schema: {
		tags: ["Submission"],
		summary: "Submit episode URL",
		request: { body: jsonBody(submitUrlRequestSchema) },
		responses: {
			200: { description: "Submission accepted", ...contentJson(submitUrlResponseSchema) },
			409: ambiguousPodcastNameConflict,
			...notFoundResponse,
			...serverErrorResponse,
			...authResponses
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
