import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function getPersonByName(c: Auth0ActionContext): Promise<Response> {
	const name = c.req.param("name");
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["POST", "GET", "OPTIONS"]
	});
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.person,
		method: "GET",
		pathSuffix: `/${encodeURIComponent(name)}`,
		successStatuses: [200],
		forwardStatuses: [404],
		logName: "secure-person-endpoint"
	});
}
