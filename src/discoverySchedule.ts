import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyToAzure } from "./proxyToAzure";

export async function getDiscoverySchedule(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["GET", "PUT", "OPTIONS"] });
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.discoverySchedule,
		method: "GET",
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "discovery-schedule-get"
	});
}

export async function putDiscoverySchedule(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, { methods: ["GET", "PUT", "OPTIONS"] });
	const data: unknown = await c.req.json();
	const body = JSON.stringify(data);
	return proxyToAzure(c, {
		permission: "admin",
		endpoint: Endpoint.discoverySchedule,
		method: "PUT",
		body,
		successStatuses: [200],
		passthroughOtherStatuses: true,
		logName: "discovery-schedule-put"
	});
}
