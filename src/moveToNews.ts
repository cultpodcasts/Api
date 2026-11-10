import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyJsonCommandToAzure } from "./proxyJsonCommandToAzure";

const organisationFieldsHint =
	"\"newsOrganisationId\"?: string, \"newsOrganisationName\"?: string, \"createOrganisation\"?: boolean, \"publisher\"?: string";

/** POST /episode/:podcastId/:episodeId/news - curator move of one podcast episode into a news organisation as a news report (same guid). */
export async function moveEpisodeToNews(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("podcastId");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyJsonCommandToAzure(
		c,
		{
			permission: "curate",
			endpoint: Endpoint.episode,
			method: "POST",
			pathSuffix: `/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}/news`,
			successStatuses: [202],
			forwardStatuses: [400, 404, 409, 500],
			logName: "secure-episode-move-to-news-endpoint"
		},
		organisationFieldsHint
	);
}

/** POST /podcast/:id/news - curator move of the listed episodes of one podcast into a news organisation (same guids). */
export async function movePodcastEpisodesToNews(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("id");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyJsonCommandToAzure(
		c,
		{
			permission: "curate",
			endpoint: Endpoint.podcast,
			method: "POST",
			pathSuffix: `/${encodeURIComponent(podcastId)}/news`,
			successStatuses: [202],
			forwardStatuses: [400, 404, 409, 500],
			logName: "secure-podcast-move-episodes-to-news-endpoint"
		},
		`"episodeIds": string[], ${organisationFieldsHint}`
	);
}
