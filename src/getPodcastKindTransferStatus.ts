import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function getPodcastKindTransferStatus(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["GET", "POST", "OPTIONS"]
	});
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.podcast,
		method: "GET",
		pathSuffix: "/" + encodeURIComponent(id) + "/kind",
		successStatuses: [200],
		forwardStatuses: [404],
		logName: "secure-podcast-kind-transfer-status-endpoint"
	});
}
