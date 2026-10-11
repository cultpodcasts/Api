import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/** RPP DiscoverySubmissionsController ViewRoles. */
export const discoverySubmissionViewPermissions = ["supervise", "admin", "curate:supervised"] as const;
/** RPP DiscoverySubmissionsController SuperviseRoles. */
export const discoverySupervisePermissions = ["supervise", "admin"] as const;

const forwardStatuses = [400, 401, 403, 404, 409, 500];
const logName = "secure-discovery-submissions-endpoint";

function idSuffix(c: Auth0ActionContext, action?: string): string {
	const id = encodeURIComponent(c.req.param("id") ?? "");
	return action ? `/${id}/${action}` : `/${id}`;
}

export async function getDiscoverySubmissions(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { omitCacheControlHeader: true, methods: ["GET", "OPTIONS"] });
	return proxyToAzure(c, {
		permission: discoverySubmissionViewPermissions,
		endpoint: Endpoint.discoverySubmissions,
		method: "GET",
		successStatuses: [200],
		forwardStatuses,
		logName
	});
}

export async function getDiscoverySubmission(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { omitCacheControlHeader: true, methods: ["GET", "OPTIONS"] });
	return proxyToAzure(c, {
		permission: discoverySubmissionViewPermissions,
		endpoint: Endpoint.discoverySubmissions,
		method: "GET",
		pathSuffix: idSuffix(c),
		successStatuses: [200],
		forwardStatuses,
		logName
	});
}

export async function putDiscoverySubmissionReview(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["PUT", "OPTIONS"] });
	const body = JSON.stringify(await c.req.json());
	return proxyToAzure(c, {
		permission: discoverySupervisePermissions,
		endpoint: Endpoint.discoverySubmissions,
		method: "PUT",
		pathSuffix: idSuffix(c, "review"),
		body,
		successStatuses: [202],
		forwardStatuses,
		logName
	});
}

export async function postDiscoverySubmissionApply(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	const body = JSON.stringify(await c.req.json());
	return proxyToAzure(c, {
		permission: discoverySupervisePermissions,
		endpoint: Endpoint.discoverySubmissions,
		method: "POST",
		pathSuffix: idSuffix(c, "apply"),
		body,
		successStatuses: [200],
		forwardStatuses,
		logName
	});
}
