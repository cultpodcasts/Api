import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function publicGetEpisode(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, {
		methods: ["GET"]
	});
	return proxyToAzure(c, {
		endpoint: Endpoint.publicEpisode,
		method: "GET",
		pathSuffix: `/${encodeURIComponent(id)}`,
		successStatuses: [200],
		forwardStatuses: [404],
		logName: "secure-public-episode-endpoint"
	});
}
