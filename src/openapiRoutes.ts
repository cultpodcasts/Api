import { OpenAPIRoute, OpenAPIRouteSchema, contentJson } from "chanfana";
import { z } from "zod";
import { Auth0Middleware } from "./Auth0Middleware";
import { addBookmark } from "./addBookmark";
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
import { getPodcastByName } from "./getPodcastByName";
import { getPodcastByNameAndEpisodeId } from "./getPodcastByNameAndEpisodeId";
import { getSubjectByName } from "./getSubjectByName";
import { getSubjects } from "./getSubjects";
import { homepage } from "./homepage";
import { homepageSsr } from "./homepageSsr";
import { indexPodcastByName } from "./indexPodcastByName";
import { publicGetEpisode } from "./publicGetEpisode";
import { publishPodcastEpisode } from "./publish";
import { publishHomepage } from "./publishHomepage";
import { publishTerm } from "./publishTerm";
import { pushSubscription } from "./pushSubscription";
import { renamePodcast } from "./renamePodcast";
import { runSearchIndexer } from "./runSearchIndexer";
import { search } from "./search";
import { submit } from "./submit";
import { submitDiscovery } from "./submitDiscovery";
import { updateEpisode, updatePodcastEpisode } from "./updateEpisode";
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

const errorSchema = z.object({ error: z.string().optional(), message: z.string().optional() });
const genericOkSchema = z.any();
const jsonBodySchema = {
    content: {
        "application/json": {
            schema: z.any()
        }
    },
    required: true
} as const;

const authResponses = {
    403: {
        description: "Unauthorized",
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
        request: { body: jsonBodySchema },
        responses: { 200: { description: "Search results", ...contentJson(genericOkSchema) } }
    }
});

export const SubmitRoute = createOpenApiRoute(submit, {
    auth: true,
    schema: {
        tags: ["Submission"],
        summary: "Submit episode URL",
        request: { body: jsonBodySchema },
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
        request: { params: idParam, body: jsonBodySchema },
        responses: { 200: { description: "Updated", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const UpdatePodcastEpisodeRoute = createOpenApiRoute(updatePodcastEpisode, {
    auth: true,
    schema: {
        tags: ["Episodes"],
        summary: "Update podcast episode by podcast id and episode id",
        request: { params: podcastIdAndEpisodeParam, body: jsonBodySchema },
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
        request: { params: podcastIdAndEpisodeParam, body: jsonBodySchema },
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
        request: { params: idParam, body: jsonBodySchema },
        responses: { 200: { description: "Podcast updated", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const UpdatePodcastPutRoute = createOpenApiRoute(updatePodcast, {
    auth: true,
    schema: {
        tags: ["Podcasts"],
        summary: "Update podcast by id (PUT)",
        request: { params: idParam, body: jsonBodySchema },
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
        request: { params: idParam, body: jsonBodySchema },
        responses: { 200: { description: "Subject updated", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const CreateSubjectRoute = createOpenApiRoute(createSubject, {
    auth: true,
    schema: {
        tags: ["Subjects"],
        summary: "Create subject",
        request: { body: jsonBodySchema },
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
        request: { body: jsonBodySchema },
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
        request: { body: jsonBodySchema },
        responses: { 200: { description: "Homepage published", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const PublishTermRoute = createOpenApiRoute(publishTerm, {
    auth: true,
    schema: {
        tags: ["Publishing"],
        summary: "Publish term",
        request: { body: jsonBodySchema },
        responses: { 200: { description: "Term published", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const RenamePodcastRoute = createOpenApiRoute(renamePodcast, {
    auth: true,
    schema: {
        tags: ["Podcasts"],
        summary: "Rename podcast",
        request: { params: nameParam, body: jsonBodySchema },
        responses: { 200: { description: "Podcast renamed", ...contentJson(genericOkSchema) }, ...authResponses }
    }
});

export const PushSubscriptionRoute = createOpenApiRoute(pushSubscription, {
    auth: true,
    schema: {
        tags: ["Notifications"],
        summary: "Create push subscription",
        request: { body: jsonBodySchema },
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