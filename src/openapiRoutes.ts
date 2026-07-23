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
	discoveryScheduleResponseSchema,
	discoveryScheduleUpdateRequestSchema,
	discoverySubmitRequestSchema,
	episodeChangeRequestSchema,
	errorSchema,
	jsonBody,
	opaqueJsonSchema,
	opaqueObjectRequestSchema,
	personChangeRequestSchema,
	podcastChangeRequestSchema,
	podcastRenameRequestSchema,
	pushSubscriptionRequestSchema,
	searchRequestSchema,
	subjectChangeRequestSchema,
	submitUrlRequestSchema,
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

/** Opaque success JSON until response DTOs are modelled per route. */
const genericOkSchema = opaqueJsonSchema;

/**
 * Auth response matrix (Wave 2 Vitest: auth-matrix.spec.ts):
 * - 401 Unauthorized: missing or invalid bearer / Auth0 payload
 * - 403 Forbidden: authenticated but missing required permission (e.g. curate, admin)
 *
 * Note: many Azure proxy handlers still collapse both cases to 403 until Wave 3
 * `proxyToAzure` extract; R2 list handlers + OpenAPI docs gate follow this matrix.
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
        responses: { 200: { description: "Homepage response" } }
    }
});

export const HomepageSsrRoute = createOpenApiRoute(homepageSsr, {
    schema: {
        tags: ["Public"],
        summary: "Get homepage server-side rendered HTML",
        responses: { 200: { description: "Homepage SSR response" } }
    }
});

export const GetSubjectsRoute = createOpenApiRoute(getSubjects, {
    auth: true,
    schema: {
        tags: ["Subjects"],
        summary: "List subjects",
        responses: { 200: { description: "Subjects", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetPeopleRoute = createOpenApiRoute(getPeople, {
    auth: true,
    schema: {
        tags: ["People"],
        summary: "List people",
        responses: { 200: { description: "People", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetPersonByNameRoute = createOpenApiRoute(getPersonByName, {
    auth: true,
    schema: {
        tags: ["People"],
        summary: "Get person by name",
        request: { params: nameParam },
        responses: { 200: { description: "Person", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const UpdatePersonRoute = createOpenApiRoute(updatePerson, {
    auth: true,
    schema: {
        tags: ["People"],
        summary: "Update person by id",
        request: { params: idParam, body: jsonBody(personChangeRequestSchema) },
        responses: { 202: { description: "Person updated", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const CreatePersonRoute = createOpenApiRoute(createPerson, {
    auth: true,
    schema: {
        tags: ["People"],
        summary: "Create person",
        request: { body: jsonBody(personChangeRequestSchema) },
        responses: { 202: { description: "Person created", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetFlairsRoute = createOpenApiRoute(getFlairs, {
    auth: true,
    schema: {
        tags: ["Subjects"],
        summary: "List flairs",
        responses: { 200: { description: "Flairs", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const SearchRoute = createOpenApiRoute(search, {
    schema: {
        tags: ["Search"],
        summary: "Search episodes",
        request: { body: jsonBody(searchRequestSchema) },
        responses: { 200: { description: "Search results", ...contentJson(genericOkSchema) } }
    }
});

export const SubmitRoute = createOpenApiRoute(submit, {
    auth: true,
    schema: {
        tags: ["Submission"],
        summary: "Submit episode URL",
        request: { body: jsonBody(submitUrlRequestSchema) },
        responses: { 200: { description: "Submission accepted", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetEpisodeRoute = createOpenApiRoute(getEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Get episode by id",
        request: { params: idParam },
        responses: { 200: { description: "Episode", ...contentJson(genericOkSchema) }, 404: { description: "Not found" }, ...authResponses }
    }
});

export const GetPodcastEpisodeRoute = createOpenApiRoute(getPodcastEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Get podcast episode by podcast id and episode id",
        request: { params: podcastAndEpisodeParam },
        responses: { 200: { description: "Podcast episode", ...contentJson(genericOkSchema) }, 404: { description: "Not found" }, ...authResponses }
    }
});

export const UpdateEpisodeRoute = createOpenApiRoute(updateEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Update episode by id",
        request: { params: idParam, body: jsonBody(episodeChangeRequestSchema) },
        responses: { 200: { description: "Updated", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const UpdatePodcastEpisodeRoute = createOpenApiRoute(updatePodcastEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Update podcast episode by podcast id and episode id",
        request: { params: podcastIdAndEpisodeParam, body: jsonBody(episodeChangeRequestSchema) },
        responses: { 200: { description: "Updated", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const DeleteEpisodeRoute = createOpenApiRoute(deleteEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Delete episode by id",
        request: { params: idParam },
        responses: { 200: { description: "Deleted", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const DeletePodcastEpisodeRoute = createOpenApiRoute(deletePodcastEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Delete podcast episode by podcast id and episode id",
        request: { params: podcastIdAndEpisodeParam },
        responses: { 200: { description: "Deleted", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const PublishPodcastEpisodeRoute = createOpenApiRoute(publishPodcastEpisode, {
    auth: true,
    schema: {
        tags: ["Publishing"],
        summary: "Publish podcast episode by podcast id and episode id",
        request: { params: podcastIdAndEpisodeParam, body: jsonBody(opaqueObjectRequestSchema) },
        responses: { 200: { description: "Published", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetOutgoingRoute = createOpenApiRoute(getOutgoing, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Get outgoing episodes",
        responses: { 200: { description: "Outgoing episodes", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetPodcastByNameRoute = createOpenApiRoute(getPodcastByName, {
    auth: true,
    schema: {
        tags: ["Podcasts"],
        summary: "Get podcast by name",
        request: { params: nameParam },
        responses: { 200: { description: "Podcast", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetPodcastByNameAndEpisodeIdRoute = createOpenApiRoute(getPodcastByNameAndEpisodeId, {
    auth: true,
    schema: {
        tags: ["Podcasts"],
        summary: "Get podcast by name and episode id",
        request: { params: podcastNameAndIdParam },
        responses: { 200: { description: "Podcast episode", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const UpdatePodcastPostRoute = createOpenApiRoute(updatePodcast, {
    auth: true,
    schema: {
        tags: ["Podcasts"],
        summary: "Update podcast by id (POST)",
        request: { params: idParam, body: jsonBody(podcastChangeRequestSchema) },
        responses: { 200: { description: "Podcast updated", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const UpdatePodcastPutRoute = createOpenApiRoute(updatePodcast, {
    auth: true,
    schema: {
        tags: ["Podcasts"],
        summary: "Update podcast by id (PUT)",
        request: { params: idParam, body: jsonBody(podcastChangeRequestSchema) },
        responses: { 200: { description: "Podcast updated", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const IndexPodcastByNameRoute = createOpenApiRoute(indexPodcastByName, {
    auth: true,
    schema: {
        tags: ["Podcasts"],
        summary: "Reindex podcast by name",
        request: { params: nameParam },
        responses: { 200: { description: "Indexed", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetSubjectByNameRoute = createOpenApiRoute(getSubjectByName, {
    auth: true,
    schema: {
        tags: ["Subjects"],
        summary: "Get subject by name",
        request: { params: nameParam },
        responses: { 200: { description: "Subject", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const UpdateSubjectRoute = createOpenApiRoute(updateSubject, {
    auth: true,
    schema: {
        tags: ["Subjects"],
        summary: "Update subject by id",
        request: { params: idParam, body: jsonBody(subjectChangeRequestSchema) },
        responses: { 200: { description: "Subject updated", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const CreateSubjectRoute = createOpenApiRoute(createSubject, {
    auth: true,
    schema: {
        tags: ["Subjects"],
        summary: "Create subject",
        request: { body: jsonBody(subjectChangeRequestSchema) },
        responses: { 200: { description: "Subject created", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetDiscoveryReportsRoute = createOpenApiRoute(getDiscoveryReports, {
    auth: true,
    schema: {
        tags: ["Discovery"],
        summary: "Get discovery curation reports",
        responses: { 200: { description: "Discovery reports", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const SubmitDiscoveryRoute = createOpenApiRoute(submitDiscovery, {
    auth: true,
    schema: {
        tags: ["Discovery"],
        summary: "Submit discovery curation",
        request: { body: jsonBody(discoverySubmitRequestSchema) },
        responses: { 200: { description: "Discovery curation submitted", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetDiscoveryInfoRoute = createOpenApiRoute(getDiscoveryInfo, {
    auth: true,
    schema: {
        tags: ["Discovery"],
        summary: "Get discovery info",
        responses: { 200: { description: "Discovery info", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const RunSearchIndexerRoute = createOpenApiRoute(runSearchIndexer, {
    auth: true,
    schema: {
        tags: ["Admin"],
        summary: "Run search indexer",
        responses: { 200: { description: "Indexer run response", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const PublishHomepageRoute = createOpenApiRoute(publishHomepage, {
    auth: true,
    schema: {
        tags: ["Publishing"],
        summary: "Publish homepage",
        request: { body: jsonBody(opaqueObjectRequestSchema) },
        responses: { 200: { description: "Homepage published", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const PublishTermRoute = createOpenApiRoute(publishTerm, {
    auth: true,
    schema: {
        tags: ["Publishing"],
        summary: "Publish term",
        request: { body: jsonBody(termSubmitRequestSchema) },
        responses: { 200: { description: "Term published", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetDiscoveryScheduleRoute = createOpenApiRoute(getDiscoverySchedule, {
    auth: true,
    schema: {
        tags: ["Discovery"],
        summary: "Get Discovery UK schedule",
        responses: { 200: { description: "Schedule", ...contentJson(discoveryScheduleResponseSchema) }, ...authResponses }
    }
});

export const PutDiscoveryScheduleRoute = createOpenApiRoute(putDiscoverySchedule, {
    auth: true,
    schema: {
        tags: ["Discovery"],
        summary: "Update Discovery UK schedule",
        request: { body: jsonBody(discoveryScheduleUpdateRequestSchema) },
        responses: { 200: { description: "Schedule updated", ...contentJson(discoveryScheduleResponseSchema) }, ...authResponses }
    }
});

export const RenamePodcastRoute = createOpenApiRoute(renamePodcast, {
    auth: true,
    schema: {
        tags: ["Podcasts"],
        summary: "Rename podcast",
        request: { params: nameParam, body: jsonBody(podcastRenameRequestSchema) },
        responses: { 200: { description: "Podcast renamed", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const PushSubscriptionRoute = createOpenApiRoute(pushSubscription, {
    auth: true,
    schema: {
        tags: ["Notifications"],
        summary: "Create push subscription",
        request: { body: jsonBody(pushSubscriptionRequestSchema) },
        responses: { 200: { description: "Subscription stored", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetPageDetailsRoute = createOpenApiRoute(getPageDetails, {
    schema: {
        tags: ["Public"],
        summary: "Get page details by podcast and episode",
        request: { params: podcastAndEpisodeParam },
        responses: { 200: { description: "Page details", ...contentJson(genericOkSchema) } }
    }
});

export const AddBookmarkRoute = createOpenApiRoute(addBookmark, {
    auth: true,
    schema: {
        tags: ["Bookmarks"],
        summary: "Add bookmark by episode id",
        request: { params: episodeIdParam },
        responses: { 200: { description: "Bookmark added", ...contentJson(genericOkSchema) }, 409: { description: "Duplicate bookmark" }, ...authResponses }
    }
});

export const DeleteBookmarkRoute = createOpenApiRoute(deleteBookmark, {
    auth: true,
    schema: {
        tags: ["Bookmarks"],
        summary: "Delete bookmark by episode id",
        request: { params: episodeIdParam },
        responses: { 200: { description: "Bookmark deleted", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetBookmarksRoute = createOpenApiRoute(getBookmarks, {
    auth: true,
    schema: {
        tags: ["Bookmarks"],
        summary: "List current user bookmarks",
        responses: { 200: { description: "Bookmarks", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const PublicGetEpisodeRoute = createOpenApiRoute(publicGetEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Get public episode by id",
        request: { params: idParam },
        responses: { 200: { description: "Public episode", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const GetLanguagesRoute = createOpenApiRoute(getLanguages, {
    auth: true,
    schema: {
        tags: ["Metadata"],
        summary: "List languages",
        responses: { 200: { description: "Languages", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});