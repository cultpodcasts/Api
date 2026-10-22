import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { hasPermission } from "./hasPermission";
import { proxyToAzure, ProxyToAzureOptions } from "./proxyToAzure";

/**
 * POST /episode/:podcastId/:episodeId/trailer — curator attach of one podcast episode to an existing film as a
 * trailer. The episode row is deleted once the film and search hold the trailer; its short link then opens the film.
 */
export async function attachEpisodeAsTrailer(c: Auth0ActionContext): Promise<Response> {
	const podcastId = c.req.param("podcastId");
	const episodeId = c.req.param("episodeId");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	const options: ProxyToAzureOptions = {
		permission: "curate",
		endpoint: Endpoint.episode,
		method: "POST",
		pathSuffix: `/${encodeURIComponent(podcastId)}/${encodeURIComponent(episodeId)}/trailer`,
		successStatuses: [202],
		forwardStatuses: [400, 404, 500],
		logName: "secure-episode-attach-trailer-endpoint"
	};
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
			return c.json({ error: "Body must be JSON: { \"filmId\": string, \"title\"?: string }" }, 400);
		}
	}
	return proxyToAzure(c, { ...options, body: JSON.stringify(data) });
}
