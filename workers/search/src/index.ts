import { adminDocs, ADMIN_DOCS_PATH } from "./admin-docs";
import { adminInventory, ADMIN_INVENTORY_PATH } from "./admin-inventory";
import { adminRebuild, rebuildAction } from "./admin-rebuild";
import { requestIdFromRequest, SearchWorkerRoute } from "./d1-session";
import { docsSearch, DOCS_SEARCH_PATH } from "./docs-search";
import type { SearchEnv } from "./env";
import { SearchWorkerErrorClass, workerErrorResponse } from "./errors";
import { health } from "./health";

/**
 * Search platform Worker (SP-1.1, cultpodcasts/Api#219).
 *
 * Owns the dedicated search D1 database. Reachable only over a service binding from the
 * api Worker (SP-1.3): `workers_dev` and preview URLs are off and there are no routes.
 * Routes: `GET /health`, and `POST /indexes/{index}/docs/search`, the Azure-shaped query engine
 * ported from `search-demo/` (SP-1.9, cultpodcasts/Api#269). Every read goes through a D1
 * Sessions API read session so read replicas can serve it (SP-1.2, #220, `d1-session.ts`).
 * `POST /admin/docs` is the index write path (SP-1.4, #222, `admin-docs.ts`): upserts and deletes in
 * one D1 transaction on the primary, with a `modifiedAt` stale-replay guard.
 * `GET /admin/docs/inventory` pages through every `{ id, modifiedAt }` for the weekly reconcile
 * (SP-2.2, RPP #1322, `admin-inventory.ts`).
 * `GET /admin/rebuild` and `POST /admin/rebuild/{action}` rebuild the whole index into shadow tables
 * and swap it in with one transaction (SP-2.3, #226, `admin-rebuild.ts`).
 *
 * The entry module exports only the handler: workerd rejects any other named export.
 */

export default {
	async fetch(request: Request, env: SearchEnv): Promise<Response> {
		const started = Date.now();
		const requestId = requestIdFromRequest(request);
		const url = new URL(request.url);
		if (url.pathname === SearchWorkerRoute.Health) {
			if (request.method !== "GET" && request.method !== "HEAD") {
				return workerErrorResponse(
					405,
					"MethodNotAllowed",
					"GET only",
					SearchWorkerErrorClass.MethodNotAllowed,
					{ requestId, route: SearchWorkerRoute.Health, durationMs: Date.now() - started }
				);
			}
			return health(env);
		}
		if (DOCS_SEARCH_PATH.test(url.pathname)) {
			if (request.method !== "POST") {
				return workerErrorResponse(
					405,
					"MethodNotAllowed",
					"POST only",
					SearchWorkerErrorClass.MethodNotAllowed,
					{ requestId, route: SearchWorkerRoute.DocsSearch, durationMs: Date.now() - started }
				);
			}
			return docsSearch(request, env);
		}
		if (url.pathname === ADMIN_INVENTORY_PATH) {
			if (request.method !== "GET") {
				return workerErrorResponse(
					405,
					"MethodNotAllowed",
					"GET only",
					SearchWorkerErrorClass.MethodNotAllowed,
					{ requestId, route: SearchWorkerRoute.AdminInventory, durationMs: Date.now() - started }
				);
			}
			return adminInventory(request, env);
		}
		if (url.pathname === ADMIN_DOCS_PATH) {
			if (request.method !== "POST") {
				return workerErrorResponse(
					405,
					"MethodNotAllowed",
					"POST only",
					SearchWorkerErrorClass.MethodNotAllowed,
					{ requestId, route: SearchWorkerRoute.AdminDocs, durationMs: Date.now() - started }
				);
			}
			return adminDocs(request, env);
		}
		const action = rebuildAction(url.pathname);
		if (action !== undefined) {
			const method = action === null ? "GET" : "POST";
			if (request.method !== method) {
				return workerErrorResponse(
					405,
					"MethodNotAllowed",
					`${method} only`,
					SearchWorkerErrorClass.MethodNotAllowed,
					{ requestId, route: SearchWorkerRoute.AdminRebuild, durationMs: Date.now() - started }
				);
			}
			return adminRebuild(request, env, action);
		}
		return workerErrorResponse(
			404,
			"NotFound",
			"Not found",
			SearchWorkerErrorClass.NotFound,
			{ requestId, route: SearchWorkerRoute.Unknown, durationMs: Date.now() - started }
		);
	}
} satisfies ExportedHandler<SearchEnv>;