import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { ProxyToAzureOptions, proxyToAzure } from "./proxyToAzure";

export async function updatePodcast(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, { methods: ["POST", "GET", "PUT", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.podcast,
		method: c.req.method as ProxyToAzureOptions["method"],
		pathSuffix: `/${encodeURIComponent(id)}`,
		body,
		successStatuses: [202],
		forwardStatuses: [404],
		logName: "secure-podcast-endpoint"
	});
}
