import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { LogCollector } from "./LogCollector";

export async function homepage(c: ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	const cache = caches.default;
	const cacheKey = new Request(c.req.url, c.req.raw);
	const cached = await cache.match(cacheKey);
	if (cached) {
		logCollector.add({ message: "Served homepage from cache." });
		console.log(logCollector.toEndpointLog());
		return cached;
	}

	let object: R2ObjectBody | null = null;
	try {
		object = await c.env.Content.get("homepage");
	} catch {
		logCollector.add({ message: `Failure to retrieve homepage` });
	}
	if (object === null) {
		logCollector.add({ message: logCollector.message ?? "No homepage object found" });
		console.error(logCollector.toEndpointLog());
		return c.notFound();
	}
	AddResponseHeaders(c, { 
		cacheControlMaxAge: 300,
		etag: object.etag, 
		methods: ["GET", "OPTIONS"] }
	);
	logCollector.add({ message: `Successfully obtained homepage data.` });
	console.log(logCollector.toEndpointLog());

	const response = new Response(object.body, {
		status: 200,
		headers: new Headers(c.res.headers)
	});

	c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
	return response;
}
