import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

async function proxyKindPublish(
	c: Auth0ActionContext,
	endpoint: Endpoint.film | Endpoint.newsReport | Endpoint.tvShowEpisode,
	logName: string
): Promise<Response> {
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	const id = c.req.param("id");
	const data: unknown = await c.req.json();
	return proxyToAzure(c, {
		permission: "curate",
		endpoint,
		method: "POST",
		pathSuffix: `/${encodeURIComponent(id)}/publish`,
		body: JSON.stringify(data),
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName
	});
}

/** Kind publish: Film / News / TV (api-infra `FilmPublish` / `NewsReportPublish` / `TvShowEpisodePublish`). */
export async function publishFilm(c: Auth0ActionContext): Promise<Response> {
	return proxyKindPublish(c, Endpoint.film, "secure-film-publish-endpoint");
}

export async function publishNewsReport(c: Auth0ActionContext): Promise<Response> {
	return proxyKindPublish(c, Endpoint.newsReport, "secure-newsreport-publish-endpoint");
}

export async function publishTvShowEpisode(c: Auth0ActionContext): Promise<Response> {
	return proxyKindPublish(c, Endpoint.tvShowEpisode, "secure-tvshowepisode-publish-endpoint");
}
