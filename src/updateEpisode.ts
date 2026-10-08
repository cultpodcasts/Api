import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function updatePodcastEpisode(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("podcastId");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["PATCH", "GET", "OPTIONS", "DELETE"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.episode,
		method: "PATCH",
		pathSuffix: `/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}`,
		body,
		successStatuses: [202],
		forwardStatuses: [400, 404, 500, 502, 504],
		logName: "secure-episode-endpoint"
	});
}
