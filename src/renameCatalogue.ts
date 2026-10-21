import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

/**
 * Admin rename of a news organisation, TV show or film (RPP #1053), proxied exactly like `renamePodcast`:
 * `POST /{kind}/name/{identifier}` → Azure `/api/{kind}/name/{identifier}`, 200 `{indexState}` passed through,
 * 400/404/409 forwarded. The 409 body is empty for a name clash, or a guid array for an ambiguous identifier.
 * The redirect itself is written by RPP to the website's `redirects` KV; the Worker does not read it.
 */
function renameProxy(endpoint: Endpoint, logName: string) {
	return async function (c: Auth0ActionContext): Promise<Response> {
		const identifier = c.req.param("identifier");
		AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
		const data: unknown = await c.req.json();
		const body = JSON.stringify(data);
		return proxyToAzure(c, {
			permission: "admin",
			endpoint,
			method: "POST",
			pathSuffix: `/name/${encodeURIComponent(identifier)}`,
			body,
			successStatuses: [200],
			forwardStatuses: [400, 404, 409],
			logName
		});
	};
}

export const renameNewsOrganisation = renameProxy(Endpoint.newsOrganisation, "secure-newsorganisation-rename-endpoint");
export const renameTvShow = renameProxy(Endpoint.tvShow, "secure-tvshow-rename-endpoint");
export const renameFilm = renameProxy(Endpoint.film, "secure-film-rename-endpoint");
