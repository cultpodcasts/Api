import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/**
 * Curator command: remove the show behind one open discovery result.
 * Azure returns 202 with an empty body. The client then GETs /discovery-curation and GET /podcast/:id.
 */
export async function banDiscoveryChannel(c: Auth0ActionContext): Promise<Response> {
	const resultId = c.req.param("resultId") ?? "";
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.discoveryCuration,
		method: "POST",
		pathSuffix: `/${encodeURIComponent(resultId)}/ban`,
		successStatuses: [202],
		emptyAcknowledgement: true,
		forwardStatuses: [400, 401, 403, 404, 409, 500],
		logName: "secure-discovery-curation-ban-endpoint"
	});
}
