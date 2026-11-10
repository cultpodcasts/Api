import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { hasPermission } from "./hasPermission";
import { proxyToAzure, ProxyToAzureOptions } from "./proxyToAzure";

const organisationFieldsHint =
	"\"newsOrganisationId\"?: string, \"newsOrganisationName\"?: string, \"createOrganisation\"?: boolean, \"publisher\"?: string";

/**
 * Shared proxy for the move-to-news commands (RPP #1388, docs/move-to-news.md). Azure validates the body; the Worker
 * only rejects a body that is not JSON (after the curate check) and forwards Azure's 202 / 400 / 404 / 409 / 500.
 */
async function proxyMoveToNews(
	c: Auth0ActionContext,
	options: ProxyToAzureOptions,
	bodyHint: string
): Promise<Response> {
	const text = await c.req.text();
	let data: unknown = {};
	if (text.trim().length > 0) {
		try {
			data = JSON.parse(text);
		} catch {
			const payload = c.var.auth0("payload");
			if (payload == null || !hasPermission(payload, "curate")) {
				// A caller without curate gets proxyToAzure's 403 (no fetch); the body is not judged first.
				return proxyToAzure(c, { ...options, body: undefined });
			}
			return c.json({ error: `Body must be JSON: { ${bodyHint} }` }, 400);
		}
	}
	return proxyToAzure(c, { ...options, body: JSON.stringify(data) });
}

/** POST /episode/:podcastId/:episodeId/news - curator move of one podcast episode into a news organisation as a news report (same guid). */
export async function moveEpisodeToNews(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("podcastId");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyMoveToNews(
		c,
		{
			permission: "curate",
			endpoint: Endpoint.episode,
			method: "POST",
			pathSuffix: `/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}/news`,
			successStatuses: [202],
			forwardStatuses: [400, 404, 409, 500],
			logName: "secure-episode-move-to-news-endpoint"
		},
		organisationFieldsHint
	);
}

/** POST /podcast/:id/news - curator move of the listed episodes of one podcast into a news organisation (same guids). */
export async function movePodcastEpisodesToNews(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("id");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyMoveToNews(
		c,
		{
			permission: "curate",
			endpoint: Endpoint.podcast,
			method: "POST",
			pathSuffix: `/${encodeURIComponent(podcastId)}/news`,
			successStatuses: [202],
			forwardStatuses: [400, 404, 409, 500],
			logName: "secure-podcast-move-episodes-to-news-endpoint"
		},
		`"episodeIds": string[], ${organisationFieldsHint}`
	);
}