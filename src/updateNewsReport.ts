import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/**
 * Curator PATCH of a news report (command): 202 on success, forwarding the episode-style
 * `EpisodeUpdateResponse` body (tweetDeleted / blueskyPostDeleted / searchIndexerState) as-is.
 * Forwards 400/401/404/500 bodies.
 */
export async function updateNewsReport(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, { methods: ["PATCH", "GET", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.newsReport,
		method: "PATCH",
		pathSuffix: `/${encodeURIComponent(id)}`,
		body,
		successStatuses: [202],
		forwardStatuses: [400, 401, 404, 500],
		logName: "secure-newsreport-update-endpoint"
	});
}
