import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyJsonCommandToAzure } from "./proxyJsonCommandToAzure";

/**
 * POST /episode/:podcastId/:episodeId/youtube-alternate — curator attach of one podcast episode's YouTube
 * upload to an existing catalogue item as an additional YouTube link (RPP #1411). The body is passed
 * through to Azure unchanged.
 */
export async function attachEpisodeYouTubeAlternate(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("podcastId");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyJsonCommandToAzure(
		c,
		{
			permission: "curate",
			endpoint: Endpoint.episode,
			method: "POST",
			pathSuffix: `/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}/youtube-alternate`,
			successStatuses: [202],
			forwardStatuses: [400, 404, 409, 500],
			logName: "secure-episode-attach-youtube-alternate-endpoint"
		},
		"\"targetKind\": \"Film\"|\"NewsReport\"|\"TvShowEpisode\"|\"Episode\", \"targetId\": string"
	);
}
