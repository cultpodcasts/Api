import { Endpoint } from "./Endpoint";

/**
 * Azure Functions HTTP routes from RPP `Cloud/Api` (`Route = ...`).
 * Host/origin is secret (`azureApiOrigin`); paths are not.
 */
export const AzureResourcePaths = {
	[Endpoint.submit]: "/api/SubmitUrl",
	[Endpoint.podcastIndex]: "/api/podcast/index",
	[Endpoint.episodePublish]: "/api/episode/publish",
	[Endpoint.discoveryCuration]: "/api/DiscoveryCuration",
	[Endpoint.episode]: "/api/episode",
	[Endpoint.publicEpisode]: "/api/public/episode",
	[Endpoint.outgoingEpisodes]: "/api/episodes/outgoing",
	[Endpoint.podcast]: "/api/podcast",
	[Endpoint.subject]: "/api/subject",
	[Endpoint.people]: "/api/people",
	[Endpoint.person]: "/api/person",
	[Endpoint.publishHomepage]: "/api/publish/homepage",
	[Endpoint.pushSubscriptions]: "/api/pushsubscription",
	[Endpoint.searchIndexer]: "/api/searchindex/run",
	[Endpoint.discoverySchedule]: "/api/discovery-schedule",
	[Endpoint.supportedLanguages]: "/api/supported-languages",
	[Endpoint.titleCasingRules]: "/api/title-casing-rules",
	[Endpoint.tvShow]: "/api/tvshow",
	[Endpoint.tvShowEpisode]: "/api/tvshowepisode",
	[Endpoint.film]: "/api/film"
} as const satisfies Record<Endpoint, string>;
