import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { LogCollector } from "./LogCollector";

export async function searchSuggestions(c: ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	const cache = caches.default;
	const cacheKey = new Request(c.req.url, { method: "GET" });
	logCollector.add({ message: `cacheKey: ${cacheKey.url}` });
	const cached = await cache.match(cacheKey);
	if (cached) {
		logCollector.addMessage("Served search-suggestions from cache.");
		console.log(logCollector.toEndpointLog());
		const hitHeaders = new Headers(cached.headers);
		hitHeaders.set("X-Search-Suggestions-Cache", "HIT");
		return new Response(cached.body, {
			status: cached.status,
			headers: hitHeaders
		});
	}

	let object: R2ObjectBody | null = null;
	try {
		object = await c.env.Content.get("search-suggestions");
	} catch {
		logCollector.addMessage(`Failure to retrieve search-suggestions`);
	}
	if (object === null) {
		logCollector.addMessage(logCollector.message ?? "No search-suggestions object found");
		console.error(logCollector.toEndpointLog());
		return c.notFound();
	}
	AddResponseHeaders(c, {
		cacheControlMaxAge: 3600,
		etag: object.etag,
		methods: ["GET", "OPTIONS"]
	});
	logCollector.addMessage(`Successfully obtained search-suggestions data.`);
	console.log(logCollector.toEndpointLog());

	const response = new Response(object.body, {
		status: 200,
		headers: new Headers(c.res.headers)
	});
	response.headers.set("X-Search-Suggestions-Cache", "MISS");

	await cache.put(cacheKey, response.clone());
	return response;
}
