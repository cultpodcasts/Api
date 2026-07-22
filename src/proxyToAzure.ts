import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { Endpoint } from "./Endpoint";
import { getEndpoint } from "./endpoints";
import { LogCollector } from "./LogCollector";

export type ProxyToAzureOptions = {
	permission: string;
	endpoint: Endpoint;
	method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	/** Status codes that are returned to the client as-is (body forwarded). */
	forwardStatuses?: number[];
	/** Status codes treated as success (default: [200]). */
	successStatuses?: number[];
	body?: string;
	appendRequestSearch?: boolean;
	logName: string;
};

/**
 * Shared Azure Functions proxy: permission gate + fetch + status mapping.
 * Success and `forwardStatuses` passthrough; other non-success become Worker 500.
 */
export async function proxyToAzure(
	c: Auth0ActionContext,
	opts: ProxyToAzureOptions
): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);

	const successStatuses = opts.successStatuses ?? [200];
	const forwardStatuses = opts.forwardStatuses ?? [];

	try {
		if (auth0Payload?.permissions && auth0Payload.permissions.includes(opts.permission)) {
			let url = getEndpoint(opts.endpoint, c.env);
			if (opts.appendRequestSearch) {
				const reqUrl = new URL(c.req.url);
				if (reqUrl.search) {
					url = new URL(url.toString() + reqUrl.search);
				}
			}

			const init: RequestInit = {
				headers: buildFetchHeaders(c.req, url),
				method: opts.method
			};
			if (opts.body !== undefined) {
				init.body = opts.body;
			}

			const resp = await fetch(url, init);
			logCollector.add({ status: resp.status });

			if (successStatuses.includes(resp.status) || forwardStatuses.includes(resp.status)) {
				logCollector.addMessage(`Successfully used ${opts.logName}.`);
				console.log(logCollector.toEndpointLog());
				return c.newResponse(resp.body, resp.status);
			}

			logCollector.addMessage(`Failed to use ${opts.logName}.`);
			console.error(logCollector.toEndpointLog());
			return c.json({ error: "Error" }, 500);
		}
	} catch {
		logCollector.addMessage(`Error in ${opts.logName}.`);
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "An error occurred" }, 500);
	}

	if (!auth0Payload) {
		logCollector.addMessage(`Unauthorised to use ${opts.logName}.`);
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Unauthorised" }, 401);
	}

	logCollector.addMessage(`Forbidden to use ${opts.logName}.`);
	console.error(logCollector.toEndpointLog());
	return c.json({ error: "Forbidden" }, 403);
}
