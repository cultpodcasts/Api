import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function submitLookup(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["GET", "OPTIONS"]
	});
	return proxyToAzure(c, {
		permission: "submit",
		endpoint: Endpoint.submit,
		method: "GET",
		appendRequestSearch: true,
		successStatuses: [200],
		forwardStatuses: [400, 404],
		logName: "secure-submit-lookup-endpoint"
	});
}
