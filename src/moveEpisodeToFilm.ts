import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/** POST /episode/:podcastId/:episodeId/film — curator move of one podcast episode into a new Film (same guid). */
export async function moveEpisodeToFilm(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("podcastId");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	const text = await c.req.text();
	const data: unknown = text.trim().length > 0 ? JSON.parse(text) : {};
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.episode,
		method: "POST",
		pathSuffix: `/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}/film`,
		body: JSON.stringify(data),
		successStatuses: [202],
		forwardStatuses: [400, 404, 409, 500],
		logName: "secure-episode-move-to-film-endpoint"
	});
}
