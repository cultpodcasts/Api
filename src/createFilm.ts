import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyJsonCommandToAzure } from "./proxyJsonCommandToAzure";

/**
 * POST /film - curator create of an empty film from a TMDB / IMDb identity or a title (RPP #1413). The body is passed
 * through to Azure unchanged. Create is a command: 202 carries `{ filmId, name }` (the client GETs /film/:id for the film).
 */
export async function createFilm(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyJsonCommandToAzure(
		c,
		{
			permission: "curate",
			endpoint: Endpoint.film,
			method: "POST",
			// 202 = created; 200 = identityDecision / cancelled (nothing written - same as Move to film).
			successStatuses: [200, 202],
			// 409 carries the existing film's filmId; 500 carries failureIndexing + filmId when the search push failed.
			forwardStatuses: [400, 404, 409, 500],
			logName: "secure-film-create-endpoint"
		},
		"\"tmdbId\"?: number, \"imdbId\"?: string, \"title\"?: string, \"publisher\"?: string, \"identityDecision\"?: string, \"selectedIdentityKey\"?: string"
	);
}
