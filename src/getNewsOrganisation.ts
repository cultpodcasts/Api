import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/**
 * Curator GET of a news organisation by guid or route-form name (RPP `NewsOrganisationGet`).
 * Forwards 401/404/500 bodies and the 409 ambiguous-name guid array.
 */
export async function getNewsOrganisation(c: Auth0ActionContext): Promise<Response> {
	const identifier = c.req.param("identifier");
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["PATCH", "GET", "OPTIONS"]
	});
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.newsOrganisation,
		method: "GET",
		pathSuffix: `/${encodeURIComponent(identifier)}`,
		successStatuses: [200],
		forwardStatuses: [401, 404, 409, 500],
		logName: "secure-newsorganisation-endpoint"
	});
}
