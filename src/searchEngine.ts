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
};

export type D1SearchFetchFailure = {
	ok: false;
	error: D1SearchFetchError;
	status?: number;
	latencyMs: number;
	body?: unknown;
	/** Present when {@link D1SearchFetchError.RequestFailed}: the thrown Error message. */
	message?: string;
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
 * `timeoutMs` is used only by the shadow sampler; the D1 primary path does not pass one.
 */
export async function fetchD1Search(args: {
	fetcher: Fetcher;
	url: string;
	requestBody: string;
	timeoutMs?: number;
}): Promise<D1SearchFetchResult> {
	const started = Date.now();
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const call = async (): Promise<D1SearchFetchResult> => {
		const response = await args.fetcher.fetch(args.url, {
			method: "POST",
			headers: { "content-type": "application/json;charset=UTF-8" },
			body: args.requestBody,
			signal: controller.signal
		});
		const latencyMs = Math.max(0, Math.round(Date.now() - started));
		let raw: string;
		try {
			raw = await response.text();
		} catch {
			return { ok: false, error: D1SearchFetchError.UnreadableBody, status: response.status, latencyMs };
		}
		let parsed: unknown;
		if (raw) {
			try {
				parsed = JSON.parse(raw);
			} catch {
				return { ok: false, error: D1SearchFetchError.NonJsonBody, status: response.status, latencyMs };
			}
		}
		if (response.status === 200) {
			if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
				return { ok: true, status: 200, body: parsed as Record<string, unknown>, latencyMs };
			}
			return { ok: false, error: D1SearchFetchError.NonObjectBody, status: 200, latencyMs, body: parsed };
		}
		return {
			ok: false,
			error: D1SearchFetchError.Status,
			status: response.status,
			latencyMs,
			body: parsed
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
