import type { OpenAPIRouteSchema } from "chanfana";
import { contentJson } from "chanfana";
import { authResponses, serverErrorResponse } from "./openapiRouteFactory";
import {
	errorSchema,
	heroCurationAppendRequestSchema,
	heroCurationDeleteEpisodesRequestSchema,
	heroCurationResponseSchema,
	heroCurationUpdateRequestSchema,
	jsonBody
} from "./openapiSchemas";

const heroTag = ["Hero curation"];
const heroReadModel = "The stored document is GET /hero-curation.";

/** OpenAPI for GET /hero-curation. Public query. */
export const getHeroCurationOpenApiSchema: OpenAPIRouteSchema = {
	tags: heroTag,
	summary: "Get the hero curation document",
	description:
		"Query. No authentication. Returns the ordered hero episode ids, the ordered rail list, and updatedAt. " +
		"Responses send Cache-Control: max-age=60. updatedAt is the compare-and-swap token for PUT /hero-curation. " +
		"PUT, POST /hero-curation/episodes, and DELETE /hero-curation/episodes acknowledge with an empty body.",
	responses: {
		200: {
			description: "Hero document. Cache-Control: max-age=60.",
			...contentJson(heroCurationResponseSchema)
		},
		...serverErrorResponse
	}
};

/** OpenAPI for PUT /hero-curation. Command. Empty 202, empty 409. */
export const putHeroCurationOpenApiSchema: OpenAPIRouteSchema = {
	tags: heroTag,
	summary: "Replace hero episode ids and/or rail subjects",
	description:
		"Command. Requires permission curate. Replaces the hero list, the rail list, or both. " +
		"A list that is omitted stays as stored. At least one list is required. " +
		"A non-null expectedUpdatedAt must equal updatedAt from GET /hero-curation; a mismatch is 409 with an empty body. " +
		"Omit expectedUpdatedAt, or send null, to write without compare-and-swap. Success is 202 with an empty body. " +
		heroReadModel,
	request: { body: jsonBody(heroCurationUpdateRequestSchema) },
	responses: {
		202: { description: "Hero curation updated (empty body)" },
		400: {
			description: "JSON could not be read, a field failed validation, or both lists were omitted",
			...contentJson(errorSchema)
		},
		409: { description: "Compare-and-swap lost (empty body)" },
		...serverErrorResponse,
		...authResponses
	}
};

/** OpenAPI for POST /hero-curation/episodes. Command. Empty 202. */
export const appendHeroCurationEpisodesOpenApiSchema: OpenAPIRouteSchema = {
	tags: heroTag,
	summary: "Add episode ids to the hero list",
	description:
		"Command. Requires permission curate. Adds episode ids to the hero list. There is no compare-and-swap. " +
		"An id that is already listed stays in place. New ids are inserted at the front, then the list is deduped and capped at 50. " +
		"Success is 202 with an empty body, including when every id was already listed. " +
		heroReadModel,
	request: { body: jsonBody(heroCurationAppendRequestSchema) },
	responses: {
		202: { description: "Hero episodes appended (empty body)" },
		400: {
			description: "JSON could not be read, or episodeIds is missing or empty",
			...contentJson(errorSchema)
		},
		...serverErrorResponse,
		...authResponses
	}
};

/** OpenAPI for DELETE /hero-curation/episodes. Command. Empty 202. */
export const deleteHeroCurationEpisodesOpenApiSchema: OpenAPIRouteSchema = {
	tags: heroTag,
	summary: "Remove episode ids from the hero list",
	description:
		"Command. Requires permission curate. Removes episode ids from the hero list. There is no compare-and-swap. " +
		"An id that is not listed is ignored. Success is 202 with an empty body. " +
		heroReadModel,
	request: { body: jsonBody(heroCurationDeleteEpisodesRequestSchema) },
	responses: {
		202: { description: "Hero episodes removed (empty body)" },
		400: {
			description: "JSON could not be read, or episodeIds is missing or empty",
			...contentJson(errorSchema)
		},
		...serverErrorResponse,
		...authResponses
	}
};
