import type { Env } from "./Env";
import { DEFAULT_SEARCH_SHADOW_TIMEOUT_MS } from "./searchShadow";

/** Served `POST /search` engine. Wrangler var `searchPrimaryEngine`. Default Azure. */
export enum SearchPrimaryEngine {
	Azure = "azure",
	D1 = "d1"
}

/** Which D1 search Worker answers when D1 is used (primary or shadow). Wrangler var `searchD1Index`. */
export enum SearchD1Index {
	Production = "production",
	Preview = "preview"
}

export type SearchPrimaryConfig = {
	engine: SearchPrimaryEngine;
	index: SearchD1Index;
};

/** Default off (Azure) so production is unchanged unless the var is set to d1. */
export function parseSearchPrimaryEngine(value: string | undefined): SearchPrimaryEngine {
	return value === SearchPrimaryEngine.D1 ? SearchPrimaryEngine.D1 : SearchPrimaryEngine.Azure;
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
 * Fetcher for the selected D1 index. Preview index requires `SEARCH_PREVIEW`; it does not
 * fall back to the production binding (that would silently hit the wrong database).
 */
export function d1SearchFetcher(
	env: Pick<Env, "SEARCH" | "SEARCH_PREVIEW" | "searchD1Index">
): Fetcher | undefined {
	if (parseSearchD1Index(env.searchD1Index) === SearchD1Index.Preview) {
		return env.SEARCH_PREVIEW;
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
	error: string;
	status?: number;
	latencyMs: number;
	body?: unknown;
};

export type D1SearchFetchResult = D1SearchFetchSuccess | D1SearchFetchFailure;

class D1SearchTimeout extends Error {
	constructor() {
		super("timeout");
		this.name = "D1SearchTimeout";
	}
}

/**
 * Query the D1 search Worker over a service binding, with the same timeout behaviour as
 * the shadow sampler. Never throws.
 */
export async function fetchD1Search(args: {
	fetcher: Fetcher;
	url: string;
	requestBody: string;
	timeoutMs?: number;
}): Promise<D1SearchFetchResult> {
	const started = Date.now();
	const timeoutMs = args.timeoutMs ?? DEFAULT_SEARCH_SHADOW_TIMEOUT_MS;
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new D1SearchTimeout());
		}, timeoutMs);
	});
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
			return { ok: false, error: "unreadable_body", status: response.status, latencyMs };
		}
		let parsed: unknown;
		if (raw) {
			try {
				parsed = JSON.parse(raw);
			} catch {
				return { ok: false, error: "non_json_body", status: response.status, latencyMs };
			}
		}
		if (response.status === 200) {
			if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
				return { ok: true, status: 200, body: parsed as Record<string, unknown>, latencyMs };
			}
			return { ok: false, error: "non_object_body", status: 200, latencyMs, body: parsed };
		}
		return {
			ok: false,
			error: `status_${response.status}`,
			status: response.status,
			latencyMs,
			body: parsed
		};
	};
	try {
		const pending = call();
		pending.catch(() => { });
		return await Promise.race([pending, timedOut]);
	} catch (e) {
		const latencyMs = Math.max(0, Math.round(Date.now() - started));
		if (e instanceof D1SearchTimeout) {
			return { ok: false, error: "timeout", latencyMs };
		}
		return { ok: false, error: e instanceof Error ? e.message : String(e), latencyMs };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Whether a failed D1 primary call should fall back to Azure. Timeouts, missing answers,
 * 429/5xx and unreadable bodies are treated as unavailable. Other 4xx stay on D1 (the
 * request is bad; Azure must not silently replace it).
 */
export function d1PrimaryIsUnavailable(result: D1SearchFetchFailure): boolean {
	const status = result.status;
	if (status === undefined) return true;
	if (status === 429 || status >= 500) return true;
	if (result.error === "non_json_body" || result.error === "unreadable_body" || result.error === "non_object_body") {
		return true;
	}
	return false;
}