import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/** Curator GET of a news report by guid (RPP `NewsReportGet`). Forwards 401/404/500 bodies. */
export async function getNewsReport(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["PATCH", "GET", "OPTIONS"]
	});
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.newsReport,
		method: "GET",
		pathSuffix: `/${encodeURIComponent(id)}`,
		successStatuses: [200],
		forwardStatuses: [401, 404, 500],
		logName: "secure-newsreport-endpoint"
	});
}
