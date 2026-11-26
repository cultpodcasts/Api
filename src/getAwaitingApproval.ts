import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/** Curator list of split-offs whose approval status is awaiting approval (RPP #1491). */
export async function getAwaitingApproval(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["GET", "OPTIONS"]
	});
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.awaitingApprovalEpisodes,
		method: "GET",
		successStatuses: [200],
		logName: "secure-episodes-awaiting-approval-endpoint"
	});
}
