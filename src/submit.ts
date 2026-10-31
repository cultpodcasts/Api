import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient, Prisma } from "@prisma/client";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { LogCollector } from "./LogCollector";
import { AzureProxyAttempt, proxyToAzure } from "./proxyToAzure";
import {
	azureSubmitBackendDenialStatus,
	azureSubmitProxyPermission,
	canCallAzureSubmitBackend
} from "./submitAccess";
import { getStreamMeta, toPrefetchedMeta } from "./submitPrepareMeta";

function nonBlank(value: unknown): boolean {
	return value != null && String(value).trim() !== "";
}

/**
 * True when the body names an attach target: a podcast (`podcastId` / `podcastName`) or a
 * news organisation / TV show parent (`parentKind` / `parentId` / `parentName`, RPP #1054).
 * An attach target needs a `submit`/`curate` caller (401/403 otherwise) and is only ever
 * persisted by Azure, never by the D1 URL-only store.
 *
 * Every field uses the same rule: any non-null value whose string form is non-blank counts,
 * whatever its JSON type (e.g. `parentId: 123`). Erring towards "attach" only means more
 * bodies need auth; it never lets an attach reach D1.
 */
function hasAttachTarget(data: {
	podcastId?: unknown;
	podcastName?: unknown;
	parentKind?: unknown;
	parentId?: unknown;
	parentName?: unknown;
}): boolean {
	return [data.podcastId, data.podcastName, data.parentKind, data.parentId, data.parentName].some(nonBlank);
}

export async function submit(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "submit" });
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	const data = await c.req.json();
	// Never trust client-supplied prefetchedMeta — only Worker KV cache.
	delete data.prefetchedMeta;
	const attachTarget = hasAttachTarget(data);
	// podcastId/podcastName and parentKind/parentId/parentName are Isolated persist only — D1 stores URL, not attach.
	if (attachTarget && !canCallAzureSubmitBackend(auth0Payload)) {
		const status = azureSubmitBackendDenialStatus(auth0Payload);
		logCollector.emitError({
			event: status === 401 ? "submit.attach_unauthorised" : "submit.attach_forbidden",
			outcome: status === 401 ? "unauthorised" : "forbidden"
		});
		return c.json(
			{ error: status === 401 ? "Unauthorised" : "Forbidden" },
			status
		);
	}
	// submit/curate JWT: Azure Isolated persist. Signed-out URL-only → D1.
	if (canCallAzureSubmitBackend(auth0Payload)) {
		let azureBody = data;
		const urlParam = typeof data.url === "string" ? data.url : data.url?.toString?.();
		let injectedPrefetchedMeta = false;
		if (urlParam && c.env.StreamMeta) {
			try {
				const cached = await getStreamMeta(c.env.StreamMeta, new URL(urlParam).toString());
				if (cached && typeof cached.madeAsFilm === "boolean") {
					azureBody = { ...data, prefetchedMeta: toPrefetchedMeta(cached) };
					injectedPrefetchedMeta = true;
					logCollector.addMessage("submit.prefetched_meta injected from StreamMeta KV");
				} else if (cached) {
					// Flagless entry (Azure without madeAsFilm, or a pre-RPP deploy): injecting it would
					// bind MadeAsFilm=false and file a film as a podcast episode. Treat as a miss.
					logCollector.addMessage("submit.prefetched_meta stale (no madeAsFilm)");
				} else {
					logCollector.addMessage("submit.prefetched_meta miss");
				}
			} catch {
				// Invalid url — Azure will 400; leave body without meta.
				logCollector.addMessage("submit.prefetched_meta skipped (invalid url)");
			}
		}
		const resp = await proxySubmitToAzure(c, auth0Payload, azureBody, logCollector);
		if (resp.status === 200) {
			// proxyToAzure already terminal-logs; this collector records KV inject trail only.
			logCollector.emit({
				event: injectedPrefetchedMeta
					? "submit.azure_ok_with_meta"
					: "submit.azure_ok",
				outcome: "success",
				status: 200
			});
			resp.headers.set("X-Origin", "true");
			return resp;
		}
		if (resp.status === 400 || resp.status === 404 || resp.status === 409) {
			logCollector.emitWarn({ event: "submit.azure_client_error", status: resp.status });
			return resp;
		}
		logCollector.emitError({
			event: "submit.azure_failed",
			outcome: "error",
			status: resp.status
		});
		return resp;
	}
	logCollector.add({ event: "submit.d1_fallback" });
	const adapter = new PrismaD1(c.env.apiDB);
	const prisma = new PrismaClient({ adapter });
	let url: URL | undefined;
	let urlParam = data.url;
	if (urlParam == null) {
		logCollector.emitError({ event: "submit.missing_url", outcome: "error" });
		return c.json({ error: "Missing url param." }, 400);
	}
	try {
		url = new URL(urlParam);
	} catch {
		logCollector.emitError({ event: "submit.invalid_url", outcome: "error" });
		return c.json({ error: `Invalid url '${data.url}'.` }, 400);
	}
	try {
		const record = {
			url: url.toString(),
			ip_address: c.req.header("CF-Connecting-IP") ?? "Unkown",
			user_agent: c.req.header("User-Agent") ?? null,
			country: c.req.header("CF-IPCountry") ?? null
		};
		await prisma.submissions.create({ data: record });
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError) {
			logCollector.addMessage(`PrismaClientKnownRequestError code: '${e.code}'`);
		}
		logCollector.emitError({ event: "submit.d1_failed", outcome: "error" });
		return c.json({ error: "Unable to accept" }, 400);
	}
	logCollector.emit({ event: "submit.d1_ok", outcome: "success" });
	return c.json({ success: "Submitted" });
}

/**
 * One retry, and only when the first POST did not receive an Isolated HTTP response
 * that might already have committed:
 *
 * ```
 * fetch throws          → retry once (no upstream status)
 * upstream 502 / 503    → retry once (gateway; body not an Isolated disposition)
 * upstream 500          → return Worker 500 once (handler may already have persisted)
 * upstream 4xx incl 422 → forward once (422 is RequiresCurator)
 * ```
 *
 * `proxyToAzure` rewrites every non-forwarded status to Worker 500, so the decision
 * reads `AzureProxyAttempt` before that rewrite. The second call is not observed,
 * so a repeated gateway failure is not posted a third time.
 */
function isSubmitGatewayRetry(attempt: AzureProxyAttempt): boolean {
	if (attempt.fetchThrew) {
		return true;
	}
	return attempt.upstreamStatus === 502 || attempt.upstreamStatus === 503;
}

async function proxySubmitToAzure(
	c: Auth0ActionContext,
	auth0Payload: Auth0JwtPayload,
	azureBody: unknown,
	logCollector: LogCollector
): Promise<Response> {
	const opts = {
		permission: azureSubmitProxyPermission(auth0Payload),
		endpoint: Endpoint.submit,
		method: "POST" as const,
		body: JSON.stringify(azureBody),
		successStatuses: [200],
		forwardStatuses: [400, 404, 409, 422],
		logName: "secure-submit-endpoint"
	};
	let attempt: AzureProxyAttempt | undefined;
	const first = await proxyToAzure(c, {
		...opts,
		observeAttempt: (seen) => {
			attempt = seen;
		}
	});
	if (attempt == null || !isSubmitGatewayRetry(attempt)) {
		return first;
	}
	logCollector.addMessage("submit.azure_retry_after_gateway");
	return proxyToAzure(c, opts);
}
