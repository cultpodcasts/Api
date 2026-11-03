import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/** Guid-only publish: podcast episodes and catalogue Film / News / TV (api-infra EpisodePublish). */
export async function publishEpisode(c: Auth0ActionContext): Promise<Response> {
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.episodePublish,
		method: "POST",
		pathSuffix: `/${encodeURIComponent(episodeId)}`,
		body,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "secure-episode-endpoint"
	});
}

export async function publishPodcastEpisode(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("podcastId");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.episodePublish,
		method: "POST",
		pathSuffix: `/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}`,
		body,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "secure-episode-endpoint"
	});
}
