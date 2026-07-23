import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { Endpoint } from "./Endpoint";
import { getEndpoint } from "./endpoints";
import { LogCollector } from "./LogCollector";

export type ProxyToAzureOptions = {
	/** Required permission. Omit to allow any authenticated principal. */
	permission?: string;
	endpoint: Endpoint;
	method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	/** Appended to the endpoint base URL (e.g. `/${id}`). */
	pathSuffix?: string;
	/** Status codes that are returned to the client as-is (body forwarded). */
	forwardStatuses?: number[];
	/** Status codes treated as success (default: [200]). */
	successStatuses?: number[];
	/** If true, any non-success status is forwarded (body + status) instead of Worker 500. */
	passthroughOtherStatuses?: boolean;
	body?: string;
	appendRequestSearch?: boolean;
	logName: string;
};

/**
 * Shared Azure Functions proxy: auth/permission gate + fetch + status mapping.
 * Success and `forwardStatuses` passthrough; other non-success become Worker 500
 * unless `passthroughOtherStatuses` is set.
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

	const permitted =
		auth0Payload != null &&
		(opts.permission == null ||
			(auth0Payload.permissions != null &&
				auth0Payload.permissions.includes(opts.permission)));

	try {
		if (permitted) {
			let url = getEndpoint(opts.endpoint, c.env);
			if (opts.pathSuffix) {
				const base = url.toString().replace(/\/$/, "");
				const suffix = opts.pathSuffix.startsWith("/")
					? opts.pathSuffix
					: `/${opts.pathSuffix}`;
				url = new URL(`${base}${suffix}`);
			}
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
				return c.newResponse(resp.body, resp.status as Parameters<typeof c.newResponse>[1]);
			}

			if (opts.passthroughOtherStatuses) {
				logCollector.addMessage(`Passthrough from ${opts.logName}.`);
				console.log(logCollector.toEndpointLog());
				return c.newResponse(resp.body, resp.status as Parameters<typeof c.newResponse>[1]);
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
