import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function getPodcastByNameAndEpisodeId(c: Auth0ActionContext): Promise<Response> {
	const name = c.req.param("name");
	const id = c.req.param("id");
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["POST", "GET", "OPTIONS"]
	});
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.podcast,
		method: "GET",
		pathSuffix: `/${encodeURIComponent(name)}/${encodeURIComponent(id)}`,
		successStatuses: [200],
		forwardStatuses: [404, 409],
		logName: "secure-podcast-endpoint-with-episode-id"
	});
}
