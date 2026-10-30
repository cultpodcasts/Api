import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/**
 * Curator "Index" of a TV show or news organisation hub, proxied like `indexPodcastByName`:
 * `POST /{kind}/index/{identifier}` → Azure `/api/{kind}/index/{identifier}` (RPP `TvShowIndex` / `NewsOrganisationIndex`).
 * `identifier` is the guid or the route-form name (may contain `/`, percent-encoded). No request body is needed; any
 * body is ignored. 200 `{indexedItemIds, searchIndexerState}` passes through; 400 (`{reason}`), 401, 404,
 * 409 (guid array) and 500 (`{error}`) are forwarded with their bodies.
 */
function indexProxy(endpoint: Endpoint, logName: string) {
	return async function (c: Auth0ActionContext): Promise<Response> {
		const identifier = c.req.param("identifier");
		AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
		return proxyToAzure(c, {
			permission: "curate",
			endpoint,
			method: "POST",
			pathSuffix: `/index/${encodeURIComponent(identifier)}`,
			successStatuses: [200],
			forwardStatuses: [400, 401, 404, 409, 500],
			logName
		});
	};
}

export const indexTvShow = indexProxy(Endpoint.tvShow, "secure-tvshow-index-endpoint");
export const indexNewsOrganisation = indexProxy(Endpoint.newsOrganisation, "secure-newsorganisation-index-endpoint");
