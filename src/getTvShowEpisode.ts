import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function getTvShowEpisode(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["POST", "GET", "OPTIONS"]
	});
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.tvShowEpisode,
		method: "GET",
		pathSuffix: `/${encodeURIComponent(id)}`,
		successStatuses: [200],
		forwardStatuses: [404],
		logName: "secure-tvshowepisode-endpoint"
	});
}
