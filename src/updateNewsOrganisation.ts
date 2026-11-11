import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/**
 * Curator PATCH of a news organisation (command): 202 with an empty body on success.
 * Forwards 400/401/404/409/500 bodies, and 503 (`youTubePlaylistLookupFailed`: YouTube could not check the main or an
 * additional channel's playlist; nothing applied, retry) so the curator sees the retryable refusal (RPP #1370).
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
		forwardStatuses: [400, 401, 404, 409, 500, 503],
		logName: "secure-newsorganisation-update-endpoint"
	});
}
