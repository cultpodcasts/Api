import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/**
 * Shared curator podcast Index proxy. 409 (indexing in progress) and 504 (TimedOut) are
 * forwarded like catalogue parent index — long backlog walks are more likely to 504.
 * Query strings are not forwarded: backlog cold-start is a dedicated path, not `?backlog=`.
 */
async function indexPodcastProxy(
	c: Auth0ActionContext,
	pathSuffix: string,
	logName: string,
	permission: string = "curate"
): Promise<Response> {
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission,
		endpoint: Endpoint.podcastIndex,
		method: "POST",
		pathSuffix,
		body,
		successStatuses: [200],
		forwardStatuses: [400, 404, 409, 504],
		logName
	});
}

/**
 * Curator hub Index (short lookback): `POST /podcast/index/:name` → Azure `/api/podcast/index/{name}`.
 */
export async function indexPodcastByName(c: Auth0ActionContext): Promise<Response> {
	const name = c.req.param("name");
	return indexPodcastProxy(c, `/${encodeURIComponent(name)}`, "secure-podcast-index-endpoint");
}

/**
 * Admin cold-start backlog Index: `POST /podcast/index/:name/backlog` → Azure
 * `/api/podcast/index/{name}/backlog` (RPP #1328 / #1310; Api #245). Admin only (RPP #1433): a full walk spends
 * provider quota and writes the whole back catalogue.
 */
export async function indexPodcastBacklogByName(c: Auth0ActionContext): Promise<Response> {
	const name = c.req.param("name");
	return indexPodcastProxy(
		c,
		`/${encodeURIComponent(name)}/backlog`,
		"secure-podcast-index-backlog-endpoint",
		"admin"
	);
}

/**
 * Admin dry run of the backlog Index: `GET /podcast/index/:name/backlog/preview` → Azure
 * `/api/podcast/index/{name}/backlog/preview`. A query: it counts the episodes a backlog index would ingest and
 * changes nothing (RPP #1433). Never cached, so the confirmation shows a fresh count.
 */
export async function previewPodcastBacklogByName(c: Auth0ActionContext): Promise<Response> {
	const name = c.req.param("name");
	AddResponseHeaders(c, { methods: ["GET", "POST", "OPTIONS"], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.podcastIndex,
		method: "GET",
		pathSuffix: `/${encodeURIComponent(name)}/backlog/preview`,
		successStatuses: [200],
		forwardStatuses: [400, 404, 504],
		logName: "secure-podcast-index-backlog-preview-endpoint"
	});
}
