import { OpenAPIRoute, OpenAPIRouteSchema, contentJson } from "chanfana";
import { z } from "zod";
import { Auth0Middleware } from "./Auth0Middleware";
import { addBookmark } from "./addBookmark";
import { createPerson } from "./createPerson";
import { createSubject } from "./createSubject";
import { deleteBookmark } from "./deleteBookmark";
import { deleteEpisode, deletePodcastEpisode } from "./deleteEpisode";
import { getBookmarks } from "./getBookmarks";
import { getDiscoveryInfo } from "./getDiscoveryInfo";
import { getDiscoveryReports } from "./getDiscoveryReports";
import { getEpisode, getPodcastEpisode } from "./getEpisode";
import { getFlairs } from "./getFlairs";
import { getLanguages } from "./getLanguages";
import { getOutgoing } from "./getOutgoing";
import { getPageDetails } from "./getPageDetails";
import { getPersonByName } from "./getPersonByName";
import { getPodcastByName } from "./getPodcastByName";
import { getPodcastByNameAndEpisodeId } from "./getPodcastByNameAndEpisodeId";
import { getSubjectByName } from "./getSubjectByName";
import { getPeople } from "./getPeople";
import { getSubjects } from "./getSubjects";
import { homepage } from "./homepage";
import { homepageSsr } from "./homepageSsr";
import { indexPodcastByName } from "./indexPodcastByName";
import {
	bookmarksListResponseSchema,
	discoveryCurationResponseSchema,
	discoveryInfoResponseSchema,
	discoveryScheduleResponseSchema,
	discoveryScheduleUpdateRequestSchema,
	discoverySubmitRequestSchema,
	discoverySubmitResponseSchema,
	emptyObjectSchema,
	episodeChangeRequestSchema,
	episodeDeleteBlockedSchema,
	episodeDtoSchema,
	episodeListResponseSchema,
	episodePublishRequestSchema,
	episodePublishResponseSchema,
	episodeUpdateResponseSchema,
	errorSchema,
	flairsResponseSchema,
	homepageResponseSchema,
	homepageSsrResponseSchema,
	indexPodcastResponseSchema,
	indexerStateDtoSchema,
	jsonBody,
	languagesResponseSchema,
	messageResponseSchema,
	pageDetailsResponseSchema,
	peopleListResponseSchema,
	personChangeRequestSchema,
	personDtoSchema,
	podcastChangeRequestSchema,
	podcastDtoSchema,
	podcastRenameRequestSchema,
	podcastRenameResponseSchema,
	publicEpisodeDtoSchema,
	publishHomepageResponseSchema,
	pushSubscriptionRequestSchema,
	searchRequestSchema,
	searchResponseSchema,
	subjectChangeRequestSchema,
	subjectDtoSchema,
	subjectsNameListResponseSchema,
	submitUrlRequestSchema,
	submitUrlResponseSchema,
	termSubmitRequestSchema
} from "./openapiSchemas";
import { publicGetEpisode } from "./publicGetEpisode";
import { publishPodcastEpisode } from "./publish";
import { publishHomepage } from "./publishHomepage";
import { publishTerm } from "./publishTerm";
import { getDiscoverySchedule, putDiscoverySchedule } from "./discoverySchedule";
import { pushSubscription } from "./pushSubscription";
import { renamePodcast } from "./renamePodcast";
import { runSearchIndexer } from "./runSearchIndexer";
import { search } from "./search";
import { submit } from "./submit";
import { submitDiscovery } from "./submitDiscovery";
import { updateEpisode, updatePodcastEpisode } from "./updateEpisode";
import { updatePerson } from "./updatePerson";
import { updatePodcast } from "./updatePodcast";
import { updateSubject } from "./updateSubject";

type RouteHandler = (c: any) => Promise<Response>;

type RouteFactoryOptions = {
    auth?: boolean;
    schema?: OpenAPIRouteSchema;
};

function createOpenApiRoute(handler: RouteHandler, options: RouteFactoryOptions = {}) {
    const schema: OpenAPIRouteSchema = options.schema ?? {};

    return class extends OpenAPIRoute {
        schema: OpenAPIRouteSchema = schema;

        async handle(c: any): Promise<Response> {
            if (options.auth) {
                const middlewareResult = await Auth0Middleware(c, async () => { });
                if (middlewareResult instanceof Response) {
                    return middlewareResult;
                }
            }
            return handler(c);
        }
    };
}

/**
 * Auth response matrix (Wave 2 Vitest: auth-matrix.spec.ts):
 * - 401 Unauthorized: missing or invalid bearer / Auth0 payload
 * - 403 Forbidden: authenticated but missing required permission (e.g. curate, admin)
 *
 * Proxied Azure routes also surface upstream 4xx via forwardStatuses / passthrough.
 */
const authResponses = {
    401: {
        description: "Unauthorized — missing or invalid authentication",
        ...contentJson(errorSchema)
    },
    403: {
        description: "Forbidden — authenticated but missing required permission",
        ...contentJson(errorSchema)
    }
};

const notFoundResponse = {
    404: {
        description: "Not found",
        ...contentJson(errorSchema)
    }
};

const serverErrorResponse = {
    500: {
        description: "Upstream or worker failure",
        ...contentJson(errorSchema)
    }
};

const idParam = z.object({ id: z.string() });
const nameParam = z.object({ name: z.string() });
const episodeIdParam = z.object({ episodeId: z.string().uuid() });
const podcastAndEpisodeParam = z.object({ podcastName: z.string(), episodeId: z.string() });
const podcastIdAndEpisodeParam = z.object({ podcastId: z.string(), episodeId: z.string() });
const podcastNameAndIdParam = z.object({ name: z.string(), id: z.string() });

export const HomepageRoute = createOpenApiRoute(homepage, {
    schema: {
        tags: ["Public"],
        summary: "Get homepage payload",
        responses: {
            200: { description: "Homepage JSON (R2)", ...contentJson(homepageResponseSchema) },
            404: { description: "Homepage object missing" }
        }
    }
});

export const HomepageSsrRoute = createOpenApiRoute(homepageSsr, {
    schema: {
        tags: ["Public"],
        summary: "Get homepage server-side rendered HTML",
        responses: {
            200: {
                description: "Pre-rendered homepage HTML (R2)",
                content: {
                    "text/html": {
                        schema: homepageSsrResponseSchema
                    }
                }
            },
            404: { description: "Homepage SSR object missing" }
        }
    }
});

export const GetSubjectsRoute = createOpenApiRoute(getSubjects, {
    auth: true,
    schema: {
        tags: ["Subjects"],
        summary: "List subjects",
        responses: { 200: { description: "Subjects (R2 name list)", ...contentJson(subjectsNameListResponseSchema) }, ...authResponses }
    }
});

export const GetPeopleRoute = createOpenApiRoute(getPeople, {
    auth: true,
    schema: {
        tags: ["People"],
        summary: "List people",
        responses: {
            200: { description: "People", ...contentJson(peopleListResponseSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetPersonByNameRoute = createOpenApiRoute(getPersonByName, {
    auth: true,
    schema: {
        tags: ["People"],
        summary: "Get person by name",
        request: { params: nameParam },
        responses: {
            200: { description: "Person", ...contentJson(personDtoSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const UpdatePersonRoute = createOpenApiRoute(updatePerson, {
    auth: true,
    schema: {
        tags: ["People"],
        summary: "Update person by id",
        request: { params: idParam, body: jsonBody(personChangeRequestSchema) },
        responses: {
            202: { description: "Person updated (empty body)" },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const CreatePersonRoute = createOpenApiRoute(createPerson, {
    auth: true,
    schema: {
        tags: ["People"],
        summary: "Create person",
        request: { body: jsonBody(personChangeRequestSchema) },
        responses: {
            202: { description: "Person created", ...contentJson(personDtoSchema) },
            400: { description: "Validation error", ...contentJson(errorSchema) },
            409: { description: "Conflict", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetFlairsRoute = createOpenApiRoute(getFlairs, {
    auth: true,
    schema: {
        tags: ["Subjects"],
        summary: "List flairs",
        responses: { 200: { description: "Flairs", ...contentJson(flairsResponseSchema) }, ...authResponses }
    }
});

export const SearchRoute = createOpenApiRoute(search, {
    schema: {
        tags: ["Search"],
        summary: "Search episodes",
        request: { body: jsonBody(searchRequestSchema) },
        responses: { 200: { description: "Search results", ...contentJson(searchResponseSchema) } }
    }
});

export const SubmitRoute = createOpenApiRoute(submit, {
    auth: true,
    schema: {
        tags: ["Submission"],
        summary: "Submit episode URL",
        request: { body: jsonBody(submitUrlRequestSchema) },
        responses: {
            200: { description: "Submission accepted", ...contentJson(submitUrlResponseSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetEpisodeRoute = createOpenApiRoute(getEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Get episode by id",
        request: { params: idParam },
        responses: {
            200: { description: "Episode", ...contentJson(episodeDtoSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetPodcastEpisodeRoute = createOpenApiRoute(getPodcastEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Get podcast episode by podcast name and episode id",
        request: { params: podcastAndEpisodeParam },
        responses: {
            200: { description: "Episode", ...contentJson(episodeDtoSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const UpdateEpisodeRoute = createOpenApiRoute(updateEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Update episode by id",
        request: { params: idParam, body: jsonBody(episodeChangeRequestSchema) },
        responses: {
            202: { description: "Accepted", ...contentJson(episodeUpdateResponseSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const UpdatePodcastEpisodeRoute = createOpenApiRoute(updatePodcastEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Update podcast episode by podcast id and episode id",
        request: { params: podcastIdAndEpisodeParam, body: jsonBody(episodeChangeRequestSchema) },
        responses: {
            202: { description: "Accepted", ...contentJson(episodeUpdateResponseSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const DeleteEpisodeRoute = createOpenApiRoute(deleteEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Delete episode by id",
        request: { params: idParam },
        responses: {
            200: { description: "Deleted (empty body)" },
            400: { description: "Delete blocked (e.g. already posted)", ...contentJson(episodeDeleteBlockedSchema) },
            409: { description: "Conflict" },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const DeletePodcastEpisodeRoute = createOpenApiRoute(deletePodcastEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Delete podcast episode by podcast id and episode id",
        request: { params: podcastIdAndEpisodeParam },
        responses: {
            200: { description: "Deleted (empty body)" },
            400: { description: "Delete blocked (e.g. already posted)", ...contentJson(episodeDeleteBlockedSchema) },
            409: { description: "Conflict" },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PublishPodcastEpisodeRoute = createOpenApiRoute(publishPodcastEpisode, {
    auth: true,
    schema: {
        tags: ["Publishing"],
        summary: "Publish podcast episode by podcast id and episode id",
        request: { params: podcastIdAndEpisodeParam, body: jsonBody(episodePublishRequestSchema) },
        responses: {
            200: { description: "Published", ...contentJson(episodePublishResponseSchema) },
            400: { description: "Publish outcome with failure details", ...contentJson(episodePublishResponseSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetOutgoingRoute = createOpenApiRoute(getOutgoing, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Get outgoing episodes",
        responses: {
            200: { description: "Outgoing episodes", ...contentJson(episodeListResponseSchema) },
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
            409: { description: "Ambiguous podcast name", ...contentJson(z.array(z.string().uuid())) },
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
            409: { description: "Ambiguous podcast name", ...contentJson(z.array(z.string().uuid())) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const UpdatePodcastPostRoute = createOpenApiRoute(updatePodcast, {
    auth: true,
    schema: {
        tags: ["Podcasts"],
        summary: "Update podcast by id (POST)",
        request: { params: idParam, body: jsonBody(podcastChangeRequestSchema) },
        responses: {
            202: { description: "Accepted (empty or indexing failure fields)" },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const UpdatePodcastPutRoute = createOpenApiRoute(updatePodcast, {
    auth: true,
    schema: {
        tags: ["Podcasts"],
        summary: "Update podcast by id (PUT)",
        request: { params: idParam, body: jsonBody(podcastChangeRequestSchema) },
        responses: {
            202: { description: "Accepted (empty or indexing failure fields)" },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const IndexPodcastByNameRoute = createOpenApiRoute(indexPodcastByName, {
    auth: true,
    schema: {
        tags: ["Podcasts"],
        summary: "Reindex podcast by name",
        request: { params: nameParam },
        responses: {
            200: { description: "Indexed", ...contentJson(indexPodcastResponseSchema) },
            400: { description: "Bad request", ...contentJson(indexPodcastResponseSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetSubjectByNameRoute = createOpenApiRoute(getSubjectByName, {
    auth: true,
    schema: {
        tags: ["Subjects"],
        summary: "Get subject by name",
        request: { params: nameParam },
        responses: {
            200: { description: "Subject", ...contentJson(subjectDtoSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const UpdateSubjectRoute = createOpenApiRoute(updateSubject, {
    auth: true,
    schema: {
        tags: ["Subjects"],
        summary: "Update subject by id",
        request: { params: idParam, body: jsonBody(subjectChangeRequestSchema) },
        responses: {
            202: { description: "Accepted (empty body)" },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const CreateSubjectRoute = createOpenApiRoute(createSubject, {
    auth: true,
    schema: {
        tags: ["Subjects"],
        summary: "Create subject",
        request: { body: jsonBody(subjectChangeRequestSchema) },
        responses: {
            202: { description: "Subject created", ...contentJson(subjectDtoSchema) },
            400: { description: "Validation error", ...contentJson(errorSchema) },
            409: { description: "Conflict", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetDiscoveryReportsRoute = createOpenApiRoute(getDiscoveryReports, {
    auth: true,
    schema: {
        tags: ["Discovery"],
        summary: "Get discovery curation reports",
        responses: {
            200: { description: "Discovery reports", ...contentJson(discoveryCurationResponseSchema) },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const SubmitDiscoveryRoute = createOpenApiRoute(submitDiscovery, {
    auth: true,
    schema: {
        tags: ["Discovery"],
        summary: "Submit discovery curation",
        request: { body: jsonBody(discoverySubmitRequestSchema) },
        responses: {
            200: { description: "Discovery curation submitted", ...contentJson(discoverySubmitResponseSchema) },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            409: { description: "Conflict", ...contentJson(errorSchema) },
            422: { description: "Unprocessable", ...contentJson(errorSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetDiscoveryInfoRoute = createOpenApiRoute(getDiscoveryInfo, {
    auth: true,
    schema: {
        tags: ["Discovery"],
        summary: "Get discovery info",
        responses: { 200: { description: "Discovery info", ...contentJson(discoveryInfoResponseSchema) }, ...authResponses }
    }
});

export const RunSearchIndexerRoute = createOpenApiRoute(runSearchIndexer, {
    auth: true,
    schema: {
        tags: ["Admin"],
        summary: "Run search indexer",
        responses: {
            200: { description: "Indexer run response", ...contentJson(indexerStateDtoSchema) },
            400: { description: "Bad request", ...contentJson(indexerStateDtoSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PublishHomepageRoute = createOpenApiRoute(publishHomepage, {
    auth: true,
    schema: {
        tags: ["Publishing"],
        summary: "Publish homepage",
        request: { body: jsonBody(emptyObjectSchema) },
        responses: {
            200: { description: "Homepage published", ...contentJson(publishHomepageResponseSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PublishTermRoute = createOpenApiRoute(publishTerm, {
    auth: true,
    schema: {
        tags: ["Publishing"],
        summary: "Publish term",
        request: { body: jsonBody(termSubmitRequestSchema) },
        responses: {
            200: { description: "Term published (empty object)" },
            409: { description: "Conflict" },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetDiscoveryScheduleRoute = createOpenApiRoute(getDiscoverySchedule, {
    auth: true,
    schema: {
        tags: ["Discovery"],
        summary: "Get Discovery UK schedule",
        responses: {
            200: { description: "Schedule", ...contentJson(discoveryScheduleResponseSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PutDiscoveryScheduleRoute = createOpenApiRoute(putDiscoverySchedule, {
    auth: true,
    schema: {
        tags: ["Discovery"],
        summary: "Update Discovery UK schedule",
        request: { body: jsonBody(discoveryScheduleUpdateRequestSchema) },
        responses: {
            200: { description: "Schedule updated", ...contentJson(discoveryScheduleResponseSchema) },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const RenamePodcastRoute = createOpenApiRoute(renamePodcast, {
    auth: true,
    schema: {
        tags: ["Podcasts"],
        summary: "Rename podcast",
        request: { params: nameParam, body: jsonBody(podcastRenameRequestSchema) },
        responses: {
            200: { description: "Podcast renamed", ...contentJson(podcastRenameResponseSchema) },
            400: { description: "Bad request" },
            409: { description: "Conflict" },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PushSubscriptionRoute = createOpenApiRoute(pushSubscription, {
    auth: true,
    schema: {
        tags: ["Notifications"],
        summary: "Create push subscription",
        request: { body: jsonBody(pushSubscriptionRequestSchema) },
        responses: {
            200: { description: "Subscription stored (empty body)" },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetPageDetailsRoute = createOpenApiRoute(getPageDetails, {
    schema: {
        tags: ["Public"],
        summary: "Get page details by podcast and episode",
        request: { params: podcastAndEpisodeParam },
        responses: { 200: { description: "Page details", ...contentJson(pageDetailsResponseSchema) } }
    }
});

export const AddBookmarkRoute = createOpenApiRoute(addBookmark, {
    auth: true,
    schema: {
        tags: ["Bookmarks"],
        summary: "Add bookmark by episode id",
        request: { params: episodeIdParam },
        responses: {
            200: { description: "Bookmark added", ...contentJson(messageResponseSchema) },
            400: { description: "Unable to create", ...contentJson(messageResponseSchema) },
            409: { description: "Duplicate bookmark", ...contentJson(messageResponseSchema) },
            ...authResponses
        }
    }
});

export const DeleteBookmarkRoute = createOpenApiRoute(deleteBookmark, {
    auth: true,
    schema: {
        tags: ["Bookmarks"],
        summary: "Delete bookmark by episode id",
        request: { params: episodeIdParam },
        responses: {
            200: { description: "Bookmark deleted", ...contentJson(messageResponseSchema) },
            400: { description: "Unable to delete", ...contentJson(messageResponseSchema) },
            ...authResponses
        }
    }
});

export const GetBookmarksRoute = createOpenApiRoute(getBookmarks, {
    auth: true,
    schema: {
        tags: ["Bookmarks"],
        summary: "List current user bookmarks",
        responses: { 200: { description: "Bookmarks", ...contentJson(bookmarksListResponseSchema) }, ...authResponses }
    }
});

export const PublicGetEpisodeRoute = createOpenApiRoute(publicGetEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Get public episode by id",
        request: { params: idParam },
        responses: {
            200: { description: "Public episode", ...contentJson(publicEpisodeDtoSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetLanguagesRoute = createOpenApiRoute(getLanguages, {
    auth: true,
    schema: {
        tags: ["Metadata"],
        summary: "List languages",
        responses: { 200: { description: "Languages", ...contentJson(languagesResponseSchema) }, ...authResponses }
    }
});