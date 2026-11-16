import type { SearchEnv } from "./env";
import { health, json } from "./health";

/**
 * Search platform Worker (SP-1.1, cultpodcasts/Api#219).
 *
 * Owns the dedicated search D1 database. Reachable only over a service binding from the
 * api Worker (SP-1.3): `workers_dev` and preview URLs are off and there are no routes.
 * The query engine (ported from `search-demo/`), Sessions API reads (SP-1.2) and the admin
 * upsert/delete route (SP-1.4) land on this Worker in their own tickets.
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
		return json({ error: { code: "NotFound", message: "Not found" } }, 404);
	}
} satisfies ExportedHandler<SearchEnv>;
