import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function getDiscoveryReports(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["POST", "GET", "OPTIONS"]
	});
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.discoveryCuration,
		method: "GET",
		appendRequestSearch: true,
		successStatuses: [200],
		forwardStatuses: [400, 401, 403, 404],
		logName: "secure-discovery-curation-endpoint"
	});
}
