import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

const adminMethods = ["GET", "POST", "DELETE", "OPTIONS"] as const;

export async function getTitleCasingRulesByLanguage(c: Auth0ActionContext): Promise<Response> {
	const language = c.req.param("language");
	// Admin mutable config — never let browsers cache GET (promote was lost-updating on stale GETs).
	AddResponseHeaders(c, { methods: [...adminMethods], omitCacheControlHeader: true });
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

export async function postTitleCasingRulesLowerCaseTerm(c: Auth0ActionContext): Promise<Response> {
	const language = c.req.param("language");
	AddResponseHeaders(c, { methods: [...adminMethods], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.titleCasingRules,
		method: "POST",
		pathSuffix: `/${encodeURIComponent(language)}/lower-case-terms`,
		body,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "title-casing-rules-post-lower-case-term"
	});
}

export async function deleteTitleCasingRulesLowerCaseTerm(c: Auth0ActionContext): Promise<Response> {
	const language = c.req.param("language");
	const term = c.req.param("term");
	AddResponseHeaders(c, { methods: [...adminMethods], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.titleCasingRules,
		method: "DELETE",
		pathSuffix: `/${encodeURIComponent(language)}/lower-case-terms/${encodeURIComponent(term)}`,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "title-casing-rules-delete-lower-case-term"
	});
}

export async function postTitleCasingRulesKnownTerm(c: Auth0ActionContext): Promise<Response> {
	const language = c.req.param("language");
	AddResponseHeaders(c, { methods: [...adminMethods], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.titleCasingRules,
		method: "POST",
		pathSuffix: `/${encodeURIComponent(language)}/known-terms`,
		body,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "title-casing-rules-post-known-term"
	});
}

export async function deleteTitleCasingRulesKnownTerm(c: Auth0ActionContext): Promise<Response> {
	const language = c.req.param("language");
	const literal = c.req.param("literal");
	AddResponseHeaders(c, { methods: [...adminMethods], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.titleCasingRules,
		method: "DELETE",
		pathSuffix: `/${encodeURIComponent(language)}/known-terms/${encodeURIComponent(literal)}`,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "title-casing-rules-delete-known-term"
	});
}

export async function postTitleCasingRulesIgnoredSubject(c: Auth0ActionContext): Promise<Response> {
	const language = c.req.param("language");
	AddResponseHeaders(c, { methods: [...adminMethods], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.titleCasingRules,
		method: "POST",
		pathSuffix: `/${encodeURIComponent(language)}/ignored-subjects`,
		body,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "title-casing-rules-post-ignored-subject"
	});
}

export async function deleteTitleCasingRulesIgnoredSubject(c: Auth0ActionContext): Promise<Response> {
	const language = c.req.param("language");
	const term = c.req.param("term");
	AddResponseHeaders(c, { methods: [...adminMethods], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.titleCasingRules,
		method: "DELETE",
		pathSuffix: `/${encodeURIComponent(language)}/ignored-subjects/${encodeURIComponent(term)}`,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "title-casing-rules-delete-ignored-subject"
	});
}
