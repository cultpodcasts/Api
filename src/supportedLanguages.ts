import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function getSupportedLanguages(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["GET", "PUT", "OPTIONS"], omitCacheControlHeader: true });
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

export async function putSupportedLanguages(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["GET", "PUT", "OPTIONS"], omitCacheControlHeader: true });
	c.header("Cache-Control", "no-store");
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.supportedLanguages,
		method: "PUT",
		body,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "supported-languages-put"
	});
}
