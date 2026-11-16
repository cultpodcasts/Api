import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

async function proxyKindDelete(
	c: Auth0ActionContext,
	endpoint: Endpoint.film | Endpoint.newsReport | Endpoint.tvShowEpisode,
	logName: string
): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE"] });
	return proxyToAzure(c, {
		permission: "admin",
		endpoint,
		method: "DELETE",
		pathSuffix: `/${encodeURIComponent(id)}`,
		successStatuses: [200],
		forwardStatuses: [404, 400, 300],
		logName
	});
}

/** Kind delete: Film / News / TV (api-infra hard-delete; blocked when tweeted). */
export async function deleteFilm(c: Auth0ActionContext): Promise<Response> {
	return proxyKindDelete(c, Endpoint.film, "secure-film-delete-endpoint");
}

export async function deleteNewsReport(c: Auth0ActionContext): Promise<Response> {
	return proxyKindDelete(c, Endpoint.newsReport, "secure-newsreport-delete-endpoint");
}

export async function deleteTvShowEpisode(c: Auth0ActionContext): Promise<Response> {
	return proxyKindDelete(c, Endpoint.tvShowEpisode, "secure-tvshowepisode-delete-endpoint");
}
