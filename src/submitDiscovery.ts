import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function submitDiscovery(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	// Worker gates on `curate`. Supervised curators also hold `curate` by design (RPP #1022);
	// Azure sees `curate:supervised` and holds the submit (202) instead of applying it.
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.discoveryCuration,
		method: "POST",
		body,
		successStatuses: [200, 202],
		forwardStatuses: [400, 401, 403, 404, 409, 422],
		logName: "secure-discovery-curation-endpoint"
	});
}
