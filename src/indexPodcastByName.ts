import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function indexPodcastByName(c: Auth0ActionContext): Promise<Response> {
	const name = c.req.param("name");
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.podcastIndex,
		method: "POST",
		pathSuffix: `/${encodeURIComponent(name)}`,
		body,
		successStatuses: [200],
		forwardStatuses: [404, 400],
		logName: "secure-podcast-index-endpoint"
	});
}
