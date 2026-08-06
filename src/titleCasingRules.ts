import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function getTitleCasingRulesByLanguage(c: Auth0ActionContext): Promise<Response> {
	const language = c.req.param("language");
	// Admin mutable config — never let browsers cache GET (promote was lost-updating on stale GETs).
	AddResponseHeaders(c, { methods: ["GET", "PUT", "OPTIONS"], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.titleCasingRules,
		method: "GET",
		pathSuffix: `/${encodeURIComponent(language)}`,
		successStatuses: [200],
		forwardStatuses: [404],
		passthroughOtherStatuses: true,
		logName: "title-casing-rules-get-by-language"
	});
}

export async function putTitleCasingRulesByLanguage(c: Auth0ActionContext): Promise<Response> {
	const language = c.req.param("language");
	AddResponseHeaders(c, { methods: ["GET", "PUT", "OPTIONS"], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.titleCasingRules,
		method: "PUT",
		pathSuffix: `/${encodeURIComponent(language)}`,
		body,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "title-casing-rules-put-by-language"
	});
}
