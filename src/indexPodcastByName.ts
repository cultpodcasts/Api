import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/**
 * Curator hub Index: `POST /podcast/index/:name` → Azure `/api/podcast/index/{name}`.
 * Query string is forwarded (`appendRequestSearch`) so `?backlog=true` reaches api-infra
 * (RPP #1310 / Api #217). 409 (indexing in progress) and 504 (TimedOut) are forwarded like
 * catalogue parent index — long backlog walks are more likely to 504.
 */
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
		appendRequestSearch: true,
		successStatuses: [200],
		forwardStatuses: [400, 404, 409, 504],
		logName: "secure-podcast-index-endpoint"
	});
}
