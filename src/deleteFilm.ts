import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function deleteFilm(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE", "PATCH"] });
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.film,
		method: "DELETE",
		pathSuffix: `/${encodeURIComponent(id)}`,
		successStatuses: [200],
		forwardStatuses: [404, 400, 300],
		logName: "secure-film-delete-endpoint"
	});
}
