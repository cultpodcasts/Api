import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function runSearchIndexer(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.searchIndexer,
		method: "POST",
		body: "{}",
		successStatuses: [200],
		forwardStatuses: [400],
		logName: "secure-admin-search-indexer-endpoint"
	});
}
