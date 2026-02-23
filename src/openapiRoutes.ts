import { OpenAPIRoute, OpenAPIRouteSchema } from "chanfana";
import { Auth0Middleware } from "./Auth0Middleware";
import { addBookmark } from "./addBookmark";
import { createSubject } from "./createSubject";
import { deleteBookmark } from "./deleteBookmark";
import { deleteEpisode } from "./deleteEpisode";
import { getBookmarks } from "./getBookmarks";
import { getDiscoveryInfo } from "./getDiscoveryInfo";
import { getDiscoveryReports } from "./getDiscoveryReports";
import { getEpisode } from "./getEpisode";
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
import { publish } from "./publish";
import { publishHomepage } from "./publishHomepage";
import { publishTerm } from "./publishTerm";
import { pushSubscription } from "./pushSubscription";
import { renamePodcast } from "./renamePodcast";
import { runSearchIndexer } from "./runSearchIndexer";
import { search } from "./search";
import { submit } from "./submit";
import { submitDiscovery } from "./submitDiscovery";
import { updateEpisode } from "./updateEpisode";
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

export const HomepageRoute = createOpenApiRoute(homepage);
export const HomepageSsrRoute = createOpenApiRoute(homepageSsr);
export const GetSubjectsRoute = createOpenApiRoute(getSubjects, { auth: true });
export const GetFlairsRoute = createOpenApiRoute(getFlairs, { auth: true });
export const SearchRoute = createOpenApiRoute(search);
export const SubmitRoute = createOpenApiRoute(submit, { auth: true });
export const GetEpisodeRoute = createOpenApiRoute(getEpisode, { auth: true });
export const UpdateEpisodeRoute = createOpenApiRoute(updateEpisode, { auth: true });
export const DeleteEpisodeRoute = createOpenApiRoute(deleteEpisode, { auth: true });
export const PublishEpisodeRoute = createOpenApiRoute(publish, { auth: true });
export const GetOutgoingRoute = createOpenApiRoute(getOutgoing, { auth: true });
export const GetPodcastByNameRoute = createOpenApiRoute(getPodcastByName, { auth: true });
export const GetPodcastByNameAndEpisodeIdRoute = createOpenApiRoute(getPodcastByNameAndEpisodeId, { auth: true });
export const UpdatePodcastPostRoute = createOpenApiRoute(updatePodcast, { auth: true });
export const UpdatePodcastPutRoute = createOpenApiRoute(updatePodcast, { auth: true });
export const IndexPodcastByNameRoute = createOpenApiRoute(indexPodcastByName, { auth: true });
export const GetSubjectByNameRoute = createOpenApiRoute(getSubjectByName, { auth: true });
export const UpdateSubjectRoute = createOpenApiRoute(updateSubject, { auth: true });
export const CreateSubjectRoute = createOpenApiRoute(createSubject, { auth: true });
export const GetDiscoveryReportsRoute = createOpenApiRoute(getDiscoveryReports, { auth: true });
export const SubmitDiscoveryRoute = createOpenApiRoute(submitDiscovery, { auth: true });
export const GetDiscoveryInfoRoute = createOpenApiRoute(getDiscoveryInfo, { auth: true });
export const RunSearchIndexerRoute = createOpenApiRoute(runSearchIndexer, { auth: true });
export const PublishHomepageRoute = createOpenApiRoute(publishHomepage, { auth: true });
export const PublishTermRoute = createOpenApiRoute(publishTerm, { auth: true });
export const RenamePodcastRoute = createOpenApiRoute(renamePodcast, { auth: true });
export const PushSubscriptionRoute = createOpenApiRoute(pushSubscription, { auth: true });
export const GetPageDetailsRoute = createOpenApiRoute(getPageDetails);
export const AddBookmarkRoute = createOpenApiRoute(addBookmark, { auth: true });
export const DeleteBookmarkRoute = createOpenApiRoute(deleteBookmark, { auth: true });
export const GetBookmarksRoute = createOpenApiRoute(getBookmarks, { auth: true });
export const PublicGetEpisodeRoute = createOpenApiRoute(publicGetEpisode, { auth: true });
export const GetLanguagesRoute = createOpenApiRoute(getLanguages, { auth: true });