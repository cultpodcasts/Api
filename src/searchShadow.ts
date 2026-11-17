import type { Env } from "./Env";

/** Service-binding origin; the search Worker ignores the host and routes on the path. */
export const SEARCH_SHADOW_ORIGIN = "https://search";

/** Fallback path when `apihost` is not a URL. The search Worker accepts any index name. */
export const SEARCH_SHADOW_FALLBACK_PATH = "/indexes/episode/docs/search";

/** Off until explicitly enabled. Turning this off is the kill switch. */
export const DEFAULT_SEARCH_SHADOW_ENABLED = false;

/** Low default sample of `/search` traffic when the kill switch is on. */
export const DEFAULT_SEARCH_SHADOW_SAMPLE_RATE = 0.01;

/** How many leading hit ids to compare. */
export const DEFAULT_SEARCH_SHADOW_TOP_N = 10;

export type SearchShadowConfig = {
	enabled: boolean;
	sampleRate: number;
	topN: number;
};

export type SearchEngineSnapshot = {
	status?: number;
	latencyMs: number;
	count: number | null;
	topIds: string[];
	error?: string;
};

export type SearchShadowOverlap = {
	topN: number;
	matched: number;
	sameOrder: boolean;
};

export type SearchShadowLog = {
	message: "search shadow";
	requestId?: string;
	query?: string;
	filter?: string;
	azure: SearchEngineSnapshot;
	d1: SearchEngineSnapshot;
	overlap: SearchShadowOverlap;
};

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
	if (value === undefined) return defaultValue;
	const v = value.trim().toLowerCase();
	if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
	if (v === "false" || v === "0" || v === "no" || v === "off" || v === "") return false;
	return defaultValue;
}

function parseRateEnv(value: string | undefined, defaultValue: number): number {
	if (value === undefined || value.trim() === "") return defaultValue;
	const n = Number(value);
	if (!Number.isFinite(n) || n < 0 || n > 1) return defaultValue;
	return n;
}

function parseTopNEnv(value: string | undefined, defaultValue: number): number {
	if (value === undefined || value.trim() === "") return defaultValue;
	const n = Number(value);
	if (!Number.isSafeInteger(n) || n < 1 || n > 100) return defaultValue;
	return n;
}

/** Sample rate and kill switch from Worker vars. Defaults are safe and low: off, 1%, top 10. */
export function parseSearchShadowConfig(env: Pick<Env, "searchShadowEnabled" | "searchShadowSampleRate" | "searchShadowTopN">): SearchShadowConfig {
	return {
		enabled: parseBooleanEnv(env.searchShadowEnabled, DEFAULT_SEARCH_SHADOW_ENABLED),
		sampleRate: parseRateEnv(env.searchShadowSampleRate, DEFAULT_SEARCH_SHADOW_SAMPLE_RATE),
		topN: parseTopNEnv(env.searchShadowTopN, DEFAULT_SEARCH_SHADOW_TOP_N)
	};
}

export function shouldSampleShadow(config: SearchShadowConfig, random: () => number = Math.random): boolean {
	return config.enabled && config.sampleRate > 0 && random() < config.sampleRate;
}

/** Point the SEARCH service binding at the same docs/search path the api Worker sends Azure. */
export function searchShadowUrl(apihost: string): string {
	try {
		const url = new URL(apihost);
		if (!url.pathname || url.pathname === "/") {
			return `${SEARCH_SHADOW_ORIGIN}${SEARCH_SHADOW_FALLBACK_PATH}`;
		}
		return `${SEARCH_SHADOW_ORIGIN}${url.pathname}${url.search}`;
	} catch {
		return `${SEARCH_SHADOW_ORIGIN}${SEARCH_SHADOW_FALLBACK_PATH}`;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hitIds(value: unknown, topN: number): string[] {
	if (!Array.isArray(value)) return [];
	const ids: string[] = [];
	for (const hit of value) {
		if (ids.length >= topN) break;
		if (isRecord(hit) && typeof hit.id === "string" && hit.id) {
			ids.push(hit.id);
		}
	}
	return ids;
}

function resultCount(body: Record<string, unknown>, topIdsLength: number): number | null {
	const count = body["@odata.count"];
	if (typeof count === "number" && Number.isFinite(count)) return count;
	if (Array.isArray(body.value)) return body.value.length;
	return topIdsLength > 0 ? topIdsLength : null;
}

/** Compact snapshot of one engine's answer. Ignores anything that is not a JSON object. */
export function snapshotSearchResponse(status: number | undefined, latencyMs: number, body: unknown, topN: number, error?: string): SearchEngineSnapshot {
	const snap: SearchEngineSnapshot = {
		latencyMs: Math.max(0, Math.round(latencyMs)),
		count: null,
		topIds: []
	};
	if (status !== undefined) snap.status = status;
	if (error) snap.error = error;
	if (isRecord(body)) {
		snap.topIds = hitIds(body.value, topN);
		snap.count = resultCount(body, snap.topIds.length);
	} else if (!error && status !== undefined && status !== 200) {
		snap.error = `status_${status}`;
	}
	return snap;
}

export function compareSearchSnapshots(azureIds: string[], d1Ids: string[], topN: number): SearchShadowOverlap {
	const d1 = new Set(d1Ids);
	let matched = 0;
	for (const id of azureIds) {
		if (d1.has(id)) matched += 1;
	}
	const sameOrder = azureIds.length === d1Ids.length && azureIds.every((id, i) => id === d1Ids[i]);
	return { topN, matched, sameOrder };
}

export type SearchShadowRun = {
	fetcher: Fetcher;
	url: string;
	requestBody: string;
	azure: SearchEngineSnapshot;
	topN: number;
	requestId?: string;
	query?: string;
	filter?: string;
	log?: (payload: SearchShadowLog) => void;
};

/**
 * Query the D1 search Worker with the same rewritten body Azure just saw, then log a compact
 * comparison. Never throws: waitUntil work must not surface as an unhandled rejection.
 * The caller's Azure result is already on its way to the client.
 */
export async function runSearchShadow(args: SearchShadowRun): Promise<SearchShadowLog> {
	const write = args.log ?? ((payload: SearchShadowLog) => console.info(payload));
	const started = Date.now();
	let d1: SearchEngineSnapshot;
	try {
		const response = await args.fetcher.fetch(args.url, {
			method: "POST",
			headers: { "content-type": "application/json;charset=UTF-8" },
			body: args.requestBody
		});
		const latencyMs = Date.now() - started;
		let body: unknown;
		let error: string | undefined;
		try {
			const raw = await response.text();
			if (raw) {
				try {
					body = JSON.parse(raw);
				} catch {
					error = "non_json_body";
				}
			} else if (response.status !== 200) {
				error = `status_${response.status}`;
			}
		} catch {
			error = "unreadable_body";
		}
		d1 = snapshotSearchResponse(response.status, latencyMs, body, args.topN, error);
	} catch (e) {
		d1 = {
			latencyMs: Math.max(0, Math.round(Date.now() - started)),
			count: null,
			topIds: [],
			error: e instanceof Error ? e.message : String(e)
		};
	}
	const payload: SearchShadowLog = {
		message: "search shadow",
		azure: args.azure,
		d1,
		overlap: compareSearchSnapshots(args.azure.topIds, d1.topIds, args.topN)
	};
	if (args.requestId) payload.requestId = args.requestId;
	if (args.query) payload.query = args.query;
	if (args.filter) payload.filter = args.filter;
	write(payload);
	return payload;
}

export function scheduleSearchShadow(
	ctx: { waitUntil: (promise: Promise<unknown>) => void } | undefined,
	work: Promise<unknown>
): void {
	const pending = work.catch((e) => {
		console.error({
			message: "search shadow failed",
			error: e instanceof Error ? e.message : String(e)
		});
	});
	if (ctx && typeof ctx.waitUntil === "function") {
		ctx.waitUntil(pending);
		return;
	}
	void pending;
}

type WaitUntilCtx = { waitUntil: (promise: Promise<unknown>) => void };

export function executionCtxOf(c: { executionCtx?: WaitUntilCtx }): WaitUntilCtx | undefined {
	try {
		const ctx = c.executionCtx;
		if (ctx && typeof ctx.waitUntil === "function") return ctx;
		return undefined;
	} catch {
		return undefined;
	}
}
