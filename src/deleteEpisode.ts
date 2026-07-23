import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function deleteEpisode(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE"] });
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.episode,
		method: "DELETE",
		pathSuffix: `/${encodeURIComponent(id)}`,
		successStatuses: [200],
		forwardStatuses: [404, 400, 300],
		logName: "secure-episode-endpoint"
	});
}

export async function deletePodcastEpisode(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("podcastId");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE"] });
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.episode,
		method: "DELETE",
		pathSuffix: `/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}`,
		successStatuses: [200],
		forwardStatuses: [404, 400, 300],
		logName: "secure-episode-endpoint"
	});
}
