import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function getTitleCasingRulesByLanguage(c: Auth0ActionContext): Promise<Response> {
	const language = c.req.param("language");
	AddResponseHeaders(c, { methods: ["GET", "PUT", "OPTIONS"] });
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
	AddResponseHeaders(c, { methods: ["GET", "PUT", "OPTIONS"] });
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
