import { docsSearch, DOCS_SEARCH_PATH } from "./docs-search";
import type { SearchEnv } from "./env";
import { health, json } from "./health";

/**
 * Search platform Worker (SP-1.1, cultpodcasts/Api#219).
 *
 * Owns the dedicated search D1 database. Reachable only over a service binding from the
 * api Worker (SP-1.3): `workers_dev` and preview URLs are off and there are no routes.
 * Routes: `GET /health`, and `POST /indexes/{index}/docs/search`, the Azure-shaped query engine
 * ported from `search-demo/` (SP-1.9, cultpodcasts/Api#269). Sessions API reads (SP-1.2) and
 * the admin upsert/delete route (SP-1.4) land here in their own tickets.
 *
 * The entry module exports only the handler: workerd rejects any other named export.
 */

export default {
	async fetch(request: Request, env: SearchEnv): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/health") {
			if (request.method !== "GET" && request.method !== "HEAD") {
				return json({ error: { code: "MethodNotAllowed", message: "GET only" } }, 405);
			}
			return health(env);
		}
		if (DOCS_SEARCH_PATH.test(url.pathname)) {
			if (request.method !== "POST") {
				return json({ error: { code: "MethodNotAllowed", message: "POST only" } }, 405);
			}
			return docsSearch(request, env);
		}
		return json({ error: { code: "NotFound", message: "Not found" } }, 404);
	}
} satisfies ExportedHandler<SearchEnv>;
