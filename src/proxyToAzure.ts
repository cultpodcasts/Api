import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { Endpoint } from "./Endpoint";
import { getEndpoint } from "./endpoints";
import { hasPermission } from "./hasPermission";
import { LogCollector } from "./LogCollector";

/** Upstream result before this proxy rewrites non-forwarded statuses to Worker 500. */
export type AzureProxyAttempt = {
	/** HTTP status from `fetch`. Absent when `fetch` threw. */
	upstreamStatus?: number;
	/** True when `fetch` threw before an HTTP response. */
	fetchThrew: boolean;
};

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
	/**
	 * Command acknowledgement. A success status is returned as 202 with an empty body.
	 * The upstream resource is not forwarded.
	 */
	emptyAcknowledgement?: boolean;
	/** If true, any non-success status is forwarded (body + status) instead of Worker 500. */
	passthroughOtherStatuses?: boolean;
	body?: string;
	appendRequestSearch?: boolean;
	logName: string;
	/**
	 * Raw upstream result, invoked before success / forward / Worker-500 mapping.
	 * Not invoked when the call is denied before `fetch`.
	 * A thrown `fetch` is `{ fetchThrew: true }` with no status — that is not an upstream HTTP 500.
	 */
	observeAttempt?: (attempt: AzureProxyAttempt) => void;
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
	logCollector.add({ route: opts.logName });

	const successStatuses = opts.successStatuses ?? [200];
	const forwardStatuses = opts.forwardStatuses ?? [];

	const permitted =
		auth0Payload != null &&
		(opts.permission == null || hasPermission(auth0Payload, opts.permission));

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

			let resp: Response;
			try {
				resp = await fetch(url, init);
			} catch {
				opts.observeAttempt?.({ fetchThrew: true });
				logCollector.emitError({
					event: "proxy.exception",
					outcome: "error"
				});
				return c.json({ error: "An error occurred" }, 500);
			}
			opts.observeAttempt?.({ fetchThrew: false, upstreamStatus: resp.status });
			logCollector.add({ status: resp.status });

			if (successStatuses.includes(resp.status)) {
				logCollector.emit({
					event: "proxy.success",
					outcome: "success"
				});
				if (opts.emptyAcknowledgement) {
					return c.newResponse(null, 202);
				}
				return c.newResponse(resp.body, resp.status as Parameters<typeof c.newResponse>[1]);
			}

			if (forwardStatuses.includes(resp.status)) {
				logCollector.emit({
					event: "proxy.forwarded",
					outcome: "passthrough"
				});
				return c.newResponse(resp.body, resp.status as Parameters<typeof c.newResponse>[1]);
			}

			if (opts.passthroughOtherStatuses) {
				logCollector.emit({
					event: "proxy.passthrough",
					outcome: "passthrough"
				});
				return c.newResponse(resp.body, resp.status as Parameters<typeof c.newResponse>[1]);
			}

			logCollector.emitError({
				event: "proxy.upstream_error",
				outcome: "error"
			});
			return c.json({ error: "Error" }, 500);
		}
	} catch {
		logCollector.emitError({
			event: "proxy.exception",
			outcome: "error"
		});
		return c.json({ error: "An error occurred" }, 500);
	}

	if (!auth0Payload) {
		logCollector.emitError({
			event: "proxy.unauthorised",
			outcome: "unauthorised"
		});
		return c.json({ error: "Unauthorised" }, 401);
	}

	logCollector.emitError({
		event: "proxy.forbidden",
		outcome: "forbidden"
	});
	return c.json({ error: "Forbidden" }, 403);
}
