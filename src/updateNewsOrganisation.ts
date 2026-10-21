import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/**
 * Curator PATCH of a news organisation (command): 202 with an empty body on success.
 * Forwards 400/401/404/500 bodies.
 */
export async function updateNewsOrganisation(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, { methods: ["PATCH", "GET", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.newsOrganisation,
		method: "PATCH",
		pathSuffix: `/${encodeURIComponent(id)}`,
		body,
		successStatuses: [202],
		emptyAcknowledgement: true,
		forwardStatuses: [400, 401, 404, 409, 500],
		logName: "secure-newsorganisation-update-endpoint"
	});
}
