import { Endpoint } from "./Endpoint";
import { Env } from "./Env";

export function getEndpoint(endpoint: Endpoint, env: Env): URL {
    let url: URL;
    switch (endpoint) {
        case Endpoint.submit:
            url = new URL(env.secureSubmitEndpoint);
            break;
        case Endpoint.podcastIndex:
            url = new URL(env.securePodcastIndexEndpoint)
            break;
        case Endpoint.episodePublish:
            url = new URL(env.secureEpisodePublishEndpoint);
            break;
        case Endpoint.discoveryCuration:
            url = new URL(env.secureDiscoveryCurationEndpoint);
            break;
        case Endpoint.episode:
            url = new URL(env.secureEpisodeEndpoint);
            break;
        case Endpoint.publicEpisode:
            url = new URL(env.securePublicEpisodeEndpoint);
            break;
        case Endpoint.outgoingEpisodes:
            url = new URL(env.secureEpisodesOutgoingEndpoint);
            break;
        case Endpoint.podcast:
            url = new URL(env.securePodcastEndpoint);
            break;
        case Endpoint.subject:
            url = new URL(env.secureSubjectEndpoint);
            break;
        case Endpoint.publishHomepage:
            url = new URL(env.secureAdminPublishHomepageEndpoint);
            break;
        case Endpoint.terms:
            url = new URL(env.secureAdminTermsEndpoint);
            break;
        case Endpoint.pushSubscriptions:
            url = new URL(env.securePushSubscriptionEndpoint);
            break;
        case Endpoint.searchIndexer:
            url = new URL(env.secureAdminSearchIndexerEndpoint);
            break;
        default:
            throw new Error(`Unrecognised endpoint: '${endpoint}'.`);
    }
    if (env.overrideHost) {
        url = new URL(`${url.protocol}//${env.overrideHost}${url.port}${url.pathname}${url.search}`);
    }
    return url;
}
