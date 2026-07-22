import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function publishHomepage(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.publishHomepage,
		method: "POST",
		body: "{}",
		successStatuses: [200],
		forwardStatuses: [500],
		logName: "secure-admin-publish-homepage-endpoint"
	});
}
