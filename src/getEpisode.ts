import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function getEpisode(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["POST", "GET", "OPTIONS", "DELETE"]
	});
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.episode,
		method: "GET",
		pathSuffix: `/${encodeURIComponent(id)}`,
		successStatuses: [200],
		forwardStatuses: [404],
		logName: "secure-episode-endpoint"
	});
}

export async function getPodcastEpisode(c: Auth0ActionContext): Promise<Response> {
	const podcastName = c.req.param("podcastName");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["POST", "GET", "OPTIONS", "DELETE"]
	});
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.episode,
		method: "GET",
		pathSuffix: `/${encodeURIComponent(podcastName)}/${encodeURIComponent(episodeId)}`,
		successStatuses: [200],
		forwardStatuses: [404],
		logName: "secure-episode-endpoint"
	});
}
