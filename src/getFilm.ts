import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function getFilm(c: Auth0ActionContext): Promise<Response> {
	const identifier = c.req.param("identifier");
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["POST", "GET", "OPTIONS"]
	});
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.film,
		method: "GET",
		pathSuffix: `/${encodeURIComponent(identifier)}`,
		successStatuses: [200],
		forwardStatuses: [404, 409],
		logName: "secure-film-endpoint"
	});
}
