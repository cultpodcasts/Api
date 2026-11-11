import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyJsonCommandToAzure } from "./proxyJsonCommandToAzure";

/** POST /newsreport/:id/tvshow - curator move of one news report into an existing or new TV show (same guid, RPP #1368). */
export async function moveNewsReportToTvShow(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyJsonCommandToAzure(
		c,
		{
			permission: "curate",
			endpoint: Endpoint.newsReport,
			method: "POST",
			pathSuffix: `/${encodeURIComponent(id)}/tvshow`,
			successStatuses: [202],
			forwardStatuses: [400, 404, 409, 500],
			logName: "secure-newsreport-move-to-tv-show-endpoint"
		},
		"\"tvShowId\"?: string, \"tvShowName\"?: string, \"createShow\"?: boolean, \"publisher\"?: string, \"title\"?: string"
	);
}

/** POST /newsreport/:id/film - curator move of one news report into a new film (same guid, RPP #1368). */
export async function moveNewsReportToFilm(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyJsonCommandToAzure(
		c,
		{
			permission: "curate",
			endpoint: Endpoint.newsReport,
			method: "POST",
			pathSuffix: `/${encodeURIComponent(id)}/film`,
			// 202 = moved; 200 = identityDecisionRequired / cancelled (nothing written - same as the episode film move).
			successStatuses: [200, 202],
			forwardStatuses: [400, 404, 409, 500],
			logName: "secure-newsreport-move-to-film-endpoint"
		},
		"\"title\"?: string, \"identityDecision\"?: string, \"selectedIdentityKey\"?: string"
	);
}
