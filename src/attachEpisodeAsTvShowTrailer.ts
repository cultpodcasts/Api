import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyJsonCommandToAzure } from "./proxyJsonCommandToAzure";

/**
 * POST /episode/:podcastId/:episodeId/tvshow-trailer — curator attach of one podcast episode to a TV show as a trailer:
 * an existing show by tvShowId, or with createShow the show named tvShowName, created first when no show has the name
 * (RPP #1412). TV shows have no search document, so Azure only deletes the episode's own search document, deletes the
 * episode row, then points the episode's short link at /tv/{name}.
 */
export async function attachEpisodeAsTvShowTrailer(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("podcastId");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyJsonCommandToAzure(
		c,
		{
			permission: "curate",
			endpoint: Endpoint.episode,
			method: "POST",
			pathSuffix: `/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}/tvshow-trailer`,
			successStatuses: [202],
			forwardStatuses: [400, 404, 409, 500],
			logName: "secure-episode-attach-tvshow-trailer-endpoint"
		},
		"\"tvShowId\": string, \"title\"?: string } or { \"createShow\": true, \"tvShowName\": string, \"publisher\"?: string, \"title\"?: string"
	);
}
