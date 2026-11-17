import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { hasPermission } from "./hasPermission";
import { LogCollector } from "./LogCollector";
import { SEARCH_INDEX_WRITE_PERMISSION } from "./searchIndexWritePermission";
import { isAuth0M2mPayload } from "./verifyAuth0M2mBearer";

/**
 * `POST /search/admin/docs`: the public door to the D1 search index write path (SP-1.4,
 * cultpodcasts/Api#222). The search Worker has no public ingress, so the RPP indexer (SP-2.1)
 * reaches its `POST /admin/docs` through here and the `SEARCH` service binding.
 *
 * Auth: an Auth0 M2M (client_credentials) token carrying the dedicated `write:search-index`
 * permission ({@link SEARCH_INDEX_WRITE_PERMISSION}), granted only to the indexer's M2M
 * application. No other permission opens this route, and a person's token is refused even if it
 * carries the permission. No new secret: the Worker already verifies Auth0 tokens with
 * `auth0Issuer` / `auth0Audience`. Auth0 setup: workers/search/README.md.
 *
 * The body is forwarded unchanged and the search Worker's answer is returned as-is: 200 with the
 * command outcome, 400 for a bad body (nothing written), 503 when D1 is unavailable (retryable).
 * 502 when the binding call itself fails; 503 when this Worker has no `SEARCH` binding.
 */
export const SEARCH_ADMIN_DOCS_URL = "https://search/admin/docs";

/** Why a valid token is refused: `not_m2m` (a person's token) or `missing_permission`; null when allowed. */
export function forbiddenReason(payload: Auth0JwtPayload): "not_m2m" | "missing_permission" | null {
	if (!isAuth0M2mPayload(payload)) return "not_m2m";
	if (!hasPermission(payload, SEARCH_INDEX_WRITE_PERMISSION)) return "missing_permission";
	return null;
}

function clientId(payload: Auth0JwtPayload): string {
	const p = payload as Auth0JwtPayload & { client_id?: unknown };
	return (typeof p.azp === "string" && p.azp) || (typeof p.client_id === "string" && p.client_id) || "(none)";
}

/**
 * The writer's auth gate, shared by every `/search/admin/*` route: 401 with no token, 403 for a
 * person's token or a client without the permission, 503 with no `SEARCH` binding. Null when the
 * request may go on.
 */
function refuse(c: Auth0ActionContext, log: LogCollector): Response | null {
	const payload: Auth0JwtPayload | null = c.var.auth0("payload");
	if (!payload) {
		log.emitError({ event: "search_admin.unauthorised", outcome: "unauthorised", status: 401 });
		return c.json({ error: "Unauthorised" }, 401);
	}
	const refusal = forbiddenReason(payload);
	if (refusal) {
		// The reason and client id say which half of the Auth0 setup is wrong; never the token or its scope.
		log.addMessage(`reason=${refusal} azp=${clientId(payload)}`);
		log.emitError({ event: "search_admin.forbidden", outcome: "forbidden", status: 403 });
		return c.json(
			{ error: `Forbidden: an M2M (client_credentials) token with ${SEARCH_INDEX_WRITE_PERMISSION} is required` },
			403
		);
	}
	if (!c.env.SEARCH) {
		log.emitError({ event: "search_admin.no_binding", outcome: "error", status: 503 });
		return c.json({ error: { code: "ServiceUnavailable", message: "Search is temporarily unavailable." } }, 503);
	}
	return null;
}

/** Returns the search Worker's answer as-is (status and JSON body), never cached. */
function relay(upstream: Response, body: string): Response {
	return new Response(body, {
		status: upstream.status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
	});
}

export async function searchAdminDocs(c: Auth0ActionContext): Promise<Response> {
	const log = new LogCollector();
	log.collectRequest(c);
	log.add({ route: "searchAdminDocs" });

	const refused = refuse(c, log);
	if (refused) return refused;

	let upstream: Response;
	try {
		upstream = await c.env.SEARCH!.fetch(SEARCH_ADMIN_DOCS_URL, {
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
		// The search Worker logs the counts (`search: admin write`); the outcome's id lists stay out of this line.
		log.emit({ event: "search_admin.ok", outcome: "success", status: upstream.status });
	} else {
		// A 400 message names the bad field.
		log.addMessage(body.slice(0, 500));
		log.emitError({ event: "search_admin.rejected", outcome: "error", status: upstream.status });
	}
	return relay(upstream, body);
}

/**
 * `GET /search/admin/docs/inventory` (SP-2.2, RPP #1322): one page of the D1 search index's
 * `{ id, modifiedAt }` inventory, for the RPP weekly reconcile. The same writer auth as
 * `POST /search/admin/docs`: only the reconcile needs it, and it already holds `write:search-index`.
 * `after` and `limit` are forwarded; the search Worker validates them (400 names the bad one).
 */
export const SEARCH_ADMIN_INVENTORY_URL = "https://search/admin/docs/inventory";

export async function searchAdminInventory(c: Auth0ActionContext): Promise<Response> {
	const log = new LogCollector();
	log.collectRequest(c);
	log.add({ route: "searchAdminInventory" });

	const refused = refuse(c, log);
	if (refused) return refused;

	const query = new URL(c.req.url).searchParams;
	const forward = new URLSearchParams();
	for (const key of ["after", "limit"]) {
		const value = query.get(key);
		if (value !== null) forward.set(key, value);
	}
	const qs = forward.toString();

	let upstream: Response;
	try {
		upstream = await c.env.SEARCH!.fetch(qs ? `${SEARCH_ADMIN_INVENTORY_URL}?${qs}` : SEARCH_ADMIN_INVENTORY_URL, {
			method: "GET"
		});
	} catch (e) {
		log.addMessage(`search binding failed: ${e instanceof Error ? e.message : String(e)}`);
		log.emitError({ event: "search_admin.upstream_error", outcome: "error", status: 502 });
		return c.json({ error: { code: "UpstreamSearchError", message: "Upstream search unavailable" } }, 502);
	}

	const body = await upstream.text();
	if (upstream.ok) {
		log.emit({ event: "search_admin.inventory_ok", outcome: "success", status: upstream.status });
	} else {
		log.addMessage(body.slice(0, 500));
		log.emitError({ event: "search_admin.rejected", outcome: "error", status: upstream.status });
	}
	return relay(upstream, body);
}
