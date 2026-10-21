import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { hasPermission } from "./hasPermission";
import { catalogueRenameRequestSchema } from "./openapiSchemas";
import { proxyToAzure } from "./proxyToAzure";

/**
 * Admin rename of a news organisation, TV show or film (RPP #1053), proxied exactly like `renamePodcast`:
 * `POST /{kind}/name/{identifier}` → Azure `/api/{kind}/name/{identifier}`, 200 `{indexState}` passed through,
 * 400/404/409 forwarded. A blank or `/`-containing `newName` is a Worker 400 (Azure not called). The 409 body is empty for a name clash, or a guid array for an ambiguous identifier.
 * The redirect itself is written by RPP to the website's `redirects` KV; the Worker does not read it.
 */
function renameProxy(endpoint: Endpoint, logName: string) {
	return async function (c: Auth0ActionContext): Promise<Response> {
		const identifier = c.req.param("identifier");
		AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
		let data: unknown;
		try {
			data = await c.req.json();
		} catch {
			data = undefined;
		}
		const parsed = catalogueRenameRequestSchema.safeParse(data);
		if (!parsed.success) {
			// Auth is still answered first (401/403 via proxyToAzure); only an admin learns the body is invalid.
			const payload = c.var.auth0("payload");
			if (payload != null && hasPermission(payload, "admin")) {
				return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid rename request" }, 400);
			}
		}
		const body = JSON.stringify(parsed.success ? parsed.data : data);
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
