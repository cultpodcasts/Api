import { Endpoint } from "./Endpoint";
import { Env } from "./Env";

/**
 * Derive a Catalogue Azure Function URL from podcast/episode secrets by replacing
 * the last path segment. Fail closed if the source path does not end with `fromSegment`
 * so we never POST film/TV bodies at the podcast/episode Function.
 */
export function rewriteTrailingSegment(
	source: string | URL,
	fromSegment: string,
	toSegment: string
): URL {
	const url = new URL(source);
	const originalPath = url.pathname;
	const rewritten = originalPath.replace(new RegExp(`/${fromSegment}/?$`), `/${toSegment}`);
	if (rewritten === originalPath) {
		throw new Error(
			`Cannot derive /${toSegment} Azure URL from '${originalPath}': expected a trailing /${fromSegment} segment`
		);
	}
	url.pathname = rewritten;
	return url;
}

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
        case Endpoint.people:
            url = new URL(env.securePeopleEndpoint);
            break;
        case Endpoint.person: {
            const peopleUrl = new URL(env.securePeopleEndpoint);
            peopleUrl.pathname = peopleUrl.pathname.replace(/\/people\/?$/, '/person');
            url = peopleUrl;
            break;
        }
        case Endpoint.tvShow:
            url = rewriteTrailingSegment(env.securePodcastEndpoint, "podcast", "tvshow");
            break;
        case Endpoint.tvShowEpisode:
            url = rewriteTrailingSegment(env.secureEpisodeEndpoint, "episode", "tvshowepisode");
            break;
        case Endpoint.film:
            url = rewriteTrailingSegment(env.securePodcastEndpoint, "podcast", "film");
            break;
        case Endpoint.publishHomepage:
            url = new URL(env.secureAdminPublishHomepageEndpoint);
            break;
        case Endpoint.discoverySchedule:
            url = new URL(env.secureDiscoveryScheduleEndpoint);
            break;
        case Endpoint.supportedLanguages:
            url = new URL(env.secureSupportedLanguagesEndpoint);
            break;
        case Endpoint.titleCasingRules:
            url = new URL(env.secureTitleCasingRulesEndpoint);
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
