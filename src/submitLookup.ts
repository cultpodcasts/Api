import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";
import {
	azureSubmitBackendDenialStatus,
	canCallAzureSubmitBackend
} from "./submitAccess";

export async function submitLookup(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["GET", "OPTIONS"]
	});
	const auth0Payload = c.var.auth0("payload");
	if (!canCallAzureSubmitBackend(auth0Payload)) {
		const status = azureSubmitBackendDenialStatus(auth0Payload);
		return c.json({ error: status === 401 ? "Unauthorised" : "Forbidden" }, status);
	}
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
