import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { LogCollector } from "./LogCollector";

export async function searchSuggestions(c: ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "searchSuggestions" });
	const cache = caches.default;
	const cacheKey = new Request(c.req.url, { method: "GET" });
	const cached = await cache.match(cacheKey);
	if (cached) {
		logCollector.emit({ event: "search_suggestions.cache_hit", outcome: "success" });
		const hitHeaders = new Headers(cached.headers);
		hitHeaders.set("X-Search-Suggestions-Cache", "HIT");
		return new Response(cached.body, { status: cached.status, headers: hitHeaders });
	}

	let object: R2ObjectBody | null = null;
	try {
		object = await c.env.Content.get("search-suggestions");
	} catch {
		logCollector.add({ event: "search_suggestions.r2_error" });
	}
	if (object === null) {
		logCollector.emitError({ event: "search_suggestions.not_found", outcome: "not_found" });
		return c.notFound();
	}
	AddResponseHeaders(c, { cacheControlMaxAge: 3600, etag: object.etag, methods: ["GET", "OPTIONS"] });
	logCollector.emit({ event: "search_suggestions.r2_hit", outcome: "success" });

	const response = new Response(object.body, { status: 200, headers: new Headers(c.res.headers) });
	response.headers.set("X-Search-Suggestions-Cache", "MISS");
	await cache.put(cacheKey, response.clone());
	return response;
}
