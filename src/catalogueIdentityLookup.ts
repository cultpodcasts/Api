import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/** Edit-time Identity tab probe — does not write Cosmos. */
export async function catalogueIdentityLookup(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.catalogueIdentityLookup,
		method: "POST",
		body,
		successStatuses: [200],
		forwardStatuses: [400, 401, 500],
		logName: "secure-catalogue-identity-lookup-endpoint"
	});
}
