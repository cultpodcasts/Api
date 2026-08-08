import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

const adminMethods = ["GET", "POST", "DELETE", "OPTIONS"] as const;

export async function getSupportedLanguages(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: [...adminMethods], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.supportedLanguages,
		method: "GET",
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "supported-languages-get"
	});
}

export async function getNeutralCultures(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["GET", "OPTIONS"], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.supportedLanguages,
		method: "GET",
		pathSuffix: "/cultures",
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "supported-languages-cultures-get"
	});
}

export async function postSupportedLanguages(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: [...adminMethods], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.supportedLanguages,
		method: "POST",
		body,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "supported-languages-post"
	});
}

export async function deleteSupportedLanguages(c: Auth0ActionContext): Promise<Response> {
	const code = c.req.param("code");
	AddResponseHeaders(c, { methods: [...adminMethods], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.supportedLanguages,
		method: "DELETE",
		pathSuffix: `/${encodeURIComponent(code)}`,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "supported-languages-delete"
	});
}
