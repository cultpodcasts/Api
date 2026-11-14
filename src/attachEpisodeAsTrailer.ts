import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { hasPermission } from "./hasPermission";
import { proxyToAzure, ProxyToAzureOptions } from "./proxyToAzure";

/**
 * POST /episode/:podcastId/:episodeId/trailer — curator attach of one podcast episode to a film as a trailer: an
 * existing film by filmId, or with createFilm the film named filmName, created first when no film has the name (#1418).
 * The episode row is deleted once the film and search hold the trailer; its short link then opens the film.
 * A new film's ambiguous IMDb/TMDB identity is a 200 with identityDecision (nothing written), as on Move to film.
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
		successStatuses: [200, 202],
		forwardStatuses: [400, 404, 409, 500],
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
			return c.json({ error: "Body must be JSON: { \"filmId\": string, \"title\"?: string } or { \"createFilm\": true, \"filmName\": string, \"title\"?: string }" }, 400);
		}
	}
	return proxyToAzure(c, { ...options, body: JSON.stringify(data) });
}
