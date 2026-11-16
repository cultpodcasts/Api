import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/** Optional query: the organisation the reports went to, so Azure can redirect the old name route to it. */
export const redirectToNewsOrganisationIdQuery = "redirectToNewsOrganisationId";

/**
 * DELETE /newsorganisation/:id[?redirectToNewsOrganisationId=] - admin hard-delete of a news organisation with no
 * reports (RPP #1397, `NewsOrganisationDelete`). Only `redirectToNewsOrganisationId` is forwarded from the query.
 * Azure answers 409 `{ message, remainingReportCount }` while any report remains, 409 `{ message }` while it is being
 * indexed, 400 for a bad or unsafe redirect target, and 200 / 404 with empty bodies.
 */
export async function deleteNewsOrganisation(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	const redirectTo = c.req.query(redirectToNewsOrganisationIdQuery);
	const query = redirectTo ? `?${redirectToNewsOrganisationIdQuery}=${encodeURIComponent(redirectTo)}` : "";
	AddResponseHeaders(c, { methods: ["GET", "PATCH", "OPTIONS", "DELETE"] });
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.newsOrganisation,
		method: "DELETE",
		pathSuffix: `/${encodeURIComponent(id)}${query}`,
		successStatuses: [200],
		forwardStatuses: [400, 404, 409, 500],
		logName: "secure-newsorganisation-delete-endpoint"
	});
}
