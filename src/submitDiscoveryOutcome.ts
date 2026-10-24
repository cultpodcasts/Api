import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/** Reconcile a lost Save response: durable per-item stamps from Azure. */
export async function submitDiscoveryOutcome(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.discoveryCuration,
		method: "POST",
		pathSuffix: "/submit-outcome",
		body,
		successStatuses: [200],
		forwardStatuses: [400, 401, 403, 404],
		logName: "secure-discovery-curation-submit-outcome"
	});
}
