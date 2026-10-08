import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function updateTvShow(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, { methods: ["PATCH", "GET", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "curate",
		endpoint: Endpoint.tvShow,
		method: "PATCH",
		pathSuffix: `/${encodeURIComponent(id)}`,
		body,
		successStatuses: [202],
		forwardStatuses: [400, 404],
		logName: "secure-tvshow-update-endpoint"
	});
}
