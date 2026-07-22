import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function getOutgoing(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["POST", "GET", "OPTIONS"]
	});
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.outgoingEpisodes,
		method: "GET",
		appendRequestSearch: true,
		successStatuses: [200],
		forwardStatuses: [400],
		logName: "secure-episodes-outgoing-endpoint"
	});
}
