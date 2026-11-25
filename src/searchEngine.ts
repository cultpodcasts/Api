import type { Env } from "./Env";

/** Which search index served or should serve `POST /search` (`@search.engine` wire values). */
export enum SearchEngine {
	Azure = "azure",
	D1 = "d1"
}

/** Which D1 search Worker answers when D1 is used (primary or shadow). Wrangler var `searchD1Index`. */
export enum SearchD1Index {
	Production = "production",
	Preview = "preview"
}

/** Fixed error codes from a D1 service-binding call. HTTP failures use {@link D1SearchFetchError.Status} plus `status`. */
export enum D1SearchFetchError {
	Timeout = "timeout",
	NonJsonBody = "non_json_body",
	UnreadableBody = "unreadable_body",
	NonObjectBody = "non_object_body",
	Status = "status",
	RequestFailed = "request_failed"
}

export type SearchPrimaryConfig = {
	engine: SearchEngine;
	index: SearchD1Index;
};

/**
 * In-code safety timeout for a D1 *primary* `/search` call. Not an env var — soak
 * tuning of `searchShadowTimeoutMs` must not change served latency. Passed to
 * {@link fetchD1Search} so shadow and primary share one timeout implementation.
 */
export const SEARCH_PRIMARY_TIMEOUT_MS = 3000;

/** Initial attempt plus one retry for transient D1 primary failures. */
export const SEARCH_PRIMARY_MAX_ATTEMPTS = 2;

/** HTTP status when the D1 primary path gives up after retries. */
export enum D1PrimaryGiveUpStatus {
	/** Every attempt timed out. */
	Timeout = 504,
	/** Thrown fetch, exhausted 5xx, or an unreadable / non-JSON body. */
	Unavailable = 502
}

/**
 * Whether a failed D1 *primary* attempt should be retried once. Retries are for
 * transient faults: timeout, a thrown binding call, or HTTP 5xx. Client errors
 * (400, 404, 429, other 4xx) and unreadable / non-JSON bodies are not retried —
 * 400 is a request/syntax error, 429 asks the client to wait (`Retry-After`),
 * and a bad body is not improved by sending the same request again.
 */
export function d1PrimaryIsRetriable(result: D1SearchFetchFailure): boolean {
	if (result.error === D1SearchFetchError.Timeout) return true;
	if (result.error === D1SearchFetchError.RequestFailed) return true;
	return result.error === D1SearchFetchError.Status
		&& typeof result.status === "number"
		&& result.status >= 500
		&& result.status <= 599;
}

/** Allowed range for the shadow sampler timeout (100–30000). */
export function parseSearchTimeoutMs(value: string | undefined, defaultValue: number): number {
	if (value === undefined || value.trim() === "") return defaultValue;
	const n = Number(value);
	if (!Number.isSafeInteger(n) || n < 100 || n > 30000) return defaultValue;
	return n;
}

/** Default off (Azure) so production is unchanged unless the var is set to d1. */
export function parseSearchPrimaryEngine(value: string | undefined): SearchEngine {
	return value === SearchEngine.D1 ? SearchEngine.D1 : SearchEngine.Azure;
}

/** Default production index (`SEARCH` / Worker `search`). */
export function parseSearchD1Index(value: string | undefined): SearchD1Index {
	return value === SearchD1Index.Preview ? SearchD1Index.Preview : SearchD1Index.Production;
}

export function parseSearchPrimaryConfig(
	env: Pick<Env, "searchPrimaryEngine" | "searchD1Index">
): SearchPrimaryConfig {
	return {
		engine: parseSearchPrimaryEngine(env.searchPrimaryEngine),
		index: parseSearchD1Index(env.searchD1Index)
	};
}

/**
 * Fetcher for the selected D1 index. `SEARCH` is always bound. Preview index uses
 * `SEARCH_PREVIEW` (required on api-preview); it does not fall back to `SEARCH`
 * (that would silently hit the wrong database).
 */
export function d1SearchFetcher(
	env: Pick<Env, "SEARCH" | "SEARCH_PREVIEW" | "searchD1Index">
): Fetcher {
	if (parseSearchD1Index(env.searchD1Index) === SearchD1Index.Preview) {
		return env.SEARCH_PREVIEW as Fetcher;
	}
	return env.SEARCH;
}

export type D1SearchFetchSuccess = {
	ok: true;
	status: number;
	body: Record<string, unknown>;
	latencyMs: number;
	servedByRegion?: string;
	sessionConstraint?: string;
};

export type D1SearchFetchFailure = {
	ok: false;
	error: D1SearchFetchError;
	status?: number;
	latencyMs: number;
	body?: unknown;
	/** Present when {@link D1SearchFetchError.RequestFailed}: the thrown Error message. */
	message?: string;
	/** `Retry-After` from the D1 Worker, when present (forwarded on a served 429). */
	retryAfter?: string;
	servedByRegion?: string;
	sessionConstraint?: string;
};

export type D1SearchFetchResult = D1SearchFetchSuccess | D1SearchFetchFailure;

class D1SearchTimeout extends Error {
	constructor() {
		super("timeout");
		this.name = "D1SearchTimeout";
	}
}

/**
 * Query the D1 search Worker over a service binding. Never throws.
 * `timeoutMs` is used by the shadow sampler (`searchShadowTimeoutMs`) and by the
 * D1 primary path ({@link SEARCH_PRIMARY_TIMEOUT_MS}).
 */
export async function fetchD1Search(args: {
	fetcher: Fetcher;
	url: string;
	requestBody: string;
	timeoutMs?: number;
	requestId?: string;
}): Promise<D1SearchFetchResult> {
	const started = Date.now();
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const call = async (): Promise<D1SearchFetchResult> => {
		const headers: Record<string, string> = { "content-type": "application/json;charset=UTF-8" };
		if (args.requestId) headers["x-request-id"] = args.requestId;
		const response = await args.fetcher.fetch(args.url, {
			method: "POST",
			headers,
			body: args.requestBody,
			signal: controller.signal
		});
		const latencyMs = Math.max(0, Math.round(Date.now() - started));
		const retryAfter = response.headers.get("retry-after") ?? undefined;
		const servedByRegion = response.headers.get("x-search-served-by-region") ?? undefined;
		const sessionConstraint = response.headers.get("x-search-session-constraint") ?? undefined;
		let raw: string;
		try {
			raw = await response.text();
		} catch {
			return { ok: false, error: D1SearchFetchError.UnreadableBody, status: response.status, latencyMs, retryAfter, servedByRegion, sessionConstraint };
		}
		let parsed: unknown;
		if (raw) {
			try {
				parsed = JSON.parse(raw);
			} catch {
				return { ok: false, error: D1SearchFetchError.NonJsonBody, status: response.status, latencyMs, retryAfter, servedByRegion, sessionConstraint };
			}
		}
		if (response.status === 200) {
			if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
				return { ok: true, status: 200, body: parsed as Record<string, unknown>, latencyMs, servedByRegion, sessionConstraint };
			}
			return { ok: false, error: D1SearchFetchError.NonObjectBody, status: 200, latencyMs, body: parsed, retryAfter, servedByRegion, sessionConstraint };
		}
		return {
			ok: false,
			error: D1SearchFetchError.Status,
			status: response.status,
			latencyMs,
			body: parsed,
			retryAfter,
			servedByRegion,
			sessionConstraint
		};
	};
	try {
		const pending = call();
		pending.catch(() => { });
		if (args.timeoutMs !== undefined) {
			const timedOut = new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					controller.abort();
					reject(new D1SearchTimeout());
				}, args.timeoutMs);
			});
			return await Promise.race([pending, timedOut]);
		}
		return await pending;
	} catch (e) {
		const latencyMs = Math.max(0, Math.round(Date.now() - started));
		if (e instanceof D1SearchTimeout) {
			return { ok: false, error: D1SearchFetchError.Timeout, latencyMs };
		}
		return {
			ok: false,
			error: D1SearchFetchError.RequestFailed,
			latencyMs,
			message: e instanceof Error ? e.message : String(e)
		};
	} finally {
		clearTimeout(timer);
	}
}

/** Compact string for logs and the shadow snapshot `error` field. */
export function d1SearchFetchErrorMessage(result: D1SearchFetchFailure): string {
	if (result.error === D1SearchFetchError.Status) {
		return `status_${result.status ?? "unknown"}`;
	}
	if (result.error === D1SearchFetchError.RequestFailed) {
		return result.message ?? D1SearchFetchError.RequestFailed;
	}
	return result.error;
}

/** Route identifiers for structured search logs. */
export enum SearchRoute {
	Search = "/search"
}

/** Classified failure causes for non-2xx search responses. */
export enum SearchErrorClass {
	BadRequest = "bad_request",
	UpstreamHttpError = "upstream_http_error",
	UpstreamFetchError = "upstream_fetch_error",
	UpstreamUnreadableBody = "upstream_unreadable_body",
	UpstreamInvalidBody = "upstream_invalid_body",
	UpstreamUnexpectedStatus = "upstream_unexpected_status",
	UnexpectedError = "unexpected_error"
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Extracts a concise error message from an upstream JSON error envelope, bounded to `limit`. */
export function extractSearchErrorMessage(body: unknown, limit: number): string | undefined {
	if (!isRecord(body) || !("error" in body)) return undefined;
	const err = body.error;
	if (typeof err === "string" && err.trim()) {
		return err.trim().slice(0, limit);
	}
	if (isRecord(err)) {
		const code = typeof err.code === "string" ? err.code.trim() : "";
		const message = typeof err.message === "string" ? err.message.trim() : "";
		const combined = [code, message].filter(Boolean).join(": ");
		if (combined) return combined.slice(0, limit);
	}
	return undefined;
}
