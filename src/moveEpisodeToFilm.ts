import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyJsonCommandToAzure } from "./proxyJsonCommandToAzure";

/** POST /episode/:podcastId/:episodeId/film - curator move of one podcast episode into a new Film (same guid). */
export async function moveEpisodeToFilm(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("podcastId");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyJsonCommandToAzure(
		c,
		{
			permission: "curate",
			endpoint: Endpoint.episode,
			method: "POST",
			pathSuffix: `/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}/film`,
			// 202 = moved; 200 = identityDecisionRequired / cancelled (nothing written - same as URL-submit).
			successStatuses: [200, 202],
			forwardStatuses: [400, 404, 409, 500],
			logName: "secure-episode-move-to-film-endpoint"
		},
		"\"title\"?: string, \"identityDecision\"?: string, \"selectedIdentityKey\"?: string"
	);
}
