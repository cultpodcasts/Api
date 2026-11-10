import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyJsonCommandToAzure } from "./proxyJsonCommandToAzure";

/** POST /episode/:podcastId/:episodeId/tvshow - curator move of one podcast episode into an existing or new TV show (same guid). */
export async function moveEpisodeToTvShow(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("podcastId");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyJsonCommandToAzure(
		c,
		{
			permission: "curate",
			endpoint: Endpoint.episode,
			method: "POST",
			pathSuffix: `/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}/tvshow`,
			successStatuses: [202],
			forwardStatuses: [400, 404, 409, 500],
			logName: "secure-episode-move-to-tv-show-endpoint"
		},
		"\"tvShowId\"?: string, \"tvShowName\"?: string, \"createShow\"?: boolean, \"publisher\"?: string, \"title\"?: string"
	);
}
