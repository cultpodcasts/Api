import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function updateEpisode(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.episode,
		method: "POST",
		pathSuffix: `/${encodeURIComponent(id)}`,
		body,
		successStatuses: [202],
		logName: "secure-episode-endpoint"
	});
}

export async function updatePodcastEpisode(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("podcastId");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.episode,
		method: "POST",
		pathSuffix: `/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}`,
		body,
		successStatuses: [202],
		logName: "secure-episode-endpoint"
	});
}
