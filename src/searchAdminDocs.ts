import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { hasPermission } from "./hasPermission";
import { LogCollector } from "./LogCollector";
import { isAuth0M2mPayload } from "./verifyAuth0M2mBearer";

/**
 * `POST /search/admin/docs`: the public door to the D1 search index write path (SP-1.4,
 * cultpodcasts/Api#222). The search Worker has no public ingress, so the RPP indexer (SP-2.1)
 * reaches its `POST /admin/docs` through here and the `SEARCH` service binding.
 *
 * Auth: an Auth0 M2M (client_credentials) token with `curate`, the same credential the Azure
 * Functions already use for hero curation. People (curators signed in to the website) cannot
 * write the index directly. No new secret: the Worker already verifies Auth0 tokens with
 * `auth0Issuer` / `auth0Audience`.
 *
 * The body is forwarded unchanged and the search Worker's answer is returned as-is: 200 with the
 * command outcome, 400 for a bad body (nothing written), 503 when D1 is unavailable (retryable).
 * 502 when the binding call itself fails; 503 when this Worker has no `SEARCH` binding.
 */
export const SEARCH_ADMIN_DOCS_URL = "https://search/admin/docs";

export async function searchAdminDocs(c: Auth0ActionContext): Promise<Response> {
	const log = new LogCollector();
	log.collectRequest(c);
	log.add({ route: "searchAdminDocs" });

	const payload: Auth0JwtPayload | null = c.var.auth0("payload");
	if (!payload) {
		log.emitError({ event: "search_admin.unauthorised", outcome: "unauthorised", status: 401 });
		return c.json({ error: "Unauthorised" }, 401);
	}
	if (!isAuth0M2mPayload(payload) || !hasPermission(payload, "curate")) {
		log.emitError({ event: "search_admin.forbidden", outcome: "forbidden", status: 403 });
		return c.json({ error: "Forbidden: an M2M (client_credentials) token with curate is required" }, 403);
	}
	if (!c.env.SEARCH) {
		log.emitError({ event: "search_admin.no_binding", outcome: "error", status: 503 });
		return c.json({ error: { code: "ServiceUnavailable", message: "Search is temporarily unavailable." } }, 503);
	}

	let upstream: Response;
	try {
		upstream = await c.env.SEARCH.fetch(SEARCH_ADMIN_DOCS_URL, {
			method: "POST",
			headers: { "content-type": "application/json; charset=utf-8" },
			body: await c.req.text()
		});
	} catch (e) {
		log.addMessage(`search binding failed: ${e instanceof Error ? e.message : String(e)}`);
		log.emitError({ event: "search_admin.upstream_error", outcome: "error", status: 502 });
		return c.json({ error: { code: "UpstreamSearchError", message: "Upstream search unavailable" } }, 502);
	}

	const body = await upstream.text();
	if (upstream.ok) {
		log.addMessage(body.slice(0, 500));
		log.emit({ event: "search_admin.ok", outcome: "success", status: upstream.status });
	} else {
		log.addMessage(body.slice(0, 500));
		log.emitError({ event: "search_admin.rejected", outcome: "error", status: upstream.status });
	}
	return new Response(body, {
		status: upstream.status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
	});
}
