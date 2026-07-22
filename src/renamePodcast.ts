import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function renamePodcast(c: Auth0ActionContext): Promise<Response> {
	const podcastName = c.req.param("name");
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.podcast,
		method: "POST",
		pathSuffix: `/name/${encodeURIComponent(podcastName)}`,
		body,
		successStatuses: [200],
		forwardStatuses: [400, 404, 409],
		logName: "secure-podcast-endpoint"
	});
}
