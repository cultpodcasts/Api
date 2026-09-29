import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { ProxyToAzureOptions, proxyToAzure } from "./proxyToAzure";

export async function transferPodcastKind(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.podcast,
		method: "POST",
		pathSuffix: "/" + encodeURIComponent(id) + "/kind",
		body,
		successStatuses: [202],
		forwardStatuses: [400, 404, 409],
		logName: "secure-podcast-kind-transfer-endpoint"
	});
}
