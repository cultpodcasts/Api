import type { Env } from "./Env";
import { writeShadowDataPoint } from "./searchShadowSoak";

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

/** The shadow D1 call is aborted after this long and logged as unavailable (`error: "timeout"`). */
export const DEFAULT_SEARCH_SHADOW_TIMEOUT_MS = 3000;

/** Most of an engine error code/message kept in the shadow log (never the raw body). */
export const SEARCH_SHADOW_ERROR_LIMIT = 200;

export type SearchShadowConfig = {
	enabled: boolean;
	sampleRate: number;
	topN: number;
	timeoutMs: number;
};

export type SearchEngineSnapshot = {
	status?: number;
	latencyMs: number;
	count: number | null;
	topIds: string[];
	error?: string;
	/** Azure only: the edge cache's `cf-cache-status` (HIT/MISS/…); D1 is never edge-cached. */
	cacheStatus?: string;
	servedByRegion?: string;
	sessionConstraint?: string;
};

/** `browse`: no free text (empty or `*`), only a podcast/subject filter; `text`: a typed search. */
export type SearchQueryKind = "text" | "browse";

/**
 * Per-sample SLO verdicts for the SP-3.2 soak (cultpodcasts/RedditPodcastPoster#1323). Workers
 * Observability can only compare a field with a constant, so anything that compares Azure with D1
 * is computed here and logged as its own field (docs/search-shadow-soak.md).
 */
export type SearchShadowSlo = {
	/** D1 answered 200 with no error. */
	d1Ok: boolean;
	/** D1 was unavailable or overloaded: 429, any 5xx, or no answer at all (binding threw). */
	d1Unavailable: boolean;
	/** Both engines answered 200. Count and overlap verdicts exist only then. */
	bothOk: boolean;
	/** D1 count minus Azure count (both 200 with counts). */
	countDelta?: number;
	/** |countDelta| <= max(2, 0.1% of the Azure count). */
	countWithin?: boolean;
	/** Overlap needed: min(topN - 1, Azure's hit ids), i.e. 9 of the top 10 for a full page. Absent when Azure had no hits. */
	overlapNeeded?: number;
	/** `overlap.matched >= overlapNeeded`. */
	overlapOk?: boolean;
};

/** SLO: counts agree within max(SEARCH_SHADOW_COUNT_ABS, SEARCH_SHADOW_COUNT_REL × Azure count). */
export const SEARCH_SHADOW_COUNT_ABS = 2;
export const SEARCH_SHADOW_COUNT_REL = 0.001;

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
	queryKind: SearchQueryKind;
	azure: SearchEngineSnapshot;
	d1: SearchEngineSnapshot;
	overlap: SearchShadowOverlap;
	slo: SearchShadowSlo;
};

export function searchQueryKind(query: string | undefined): SearchQueryKind {
	const q = (query ?? "").trim();
	return q === "" || q === "*" ? "browse" : "text";
}

function answered(snap: SearchEngineSnapshot): boolean {
	return snap.status === 200 && !snap.error;
}

/** The soak's per-sample verdicts (see {@link SearchShadowSlo}). */
export function shadowSlo(azure: SearchEngineSnapshot, d1: SearchEngineSnapshot, overlap: SearchShadowOverlap): SearchShadowSlo {
	const d1Ok = answered(d1);
	const d1Unavailable = !d1Ok && (d1.status === undefined || d1.status === 429 || d1.status >= 500);
	const bothOk = d1Ok && answered(azure);
	const slo: SearchShadowSlo = { d1Ok, d1Unavailable, bothOk };
	if (!bothOk) return slo;
	if (azure.count !== null && d1.count !== null) {
		slo.countDelta = d1.count - azure.count;
		slo.countWithin = Math.abs(slo.countDelta) <= Math.max(SEARCH_SHADOW_COUNT_ABS, SEARCH_SHADOW_COUNT_REL * azure.count);
	}
	// An empty Azure page has nothing to overlap with: no verdict, so it stays out of SLO 4's
	// denominator instead of passing vacuously. Its count verdict above still applies.
	if (azure.topIds.length === 0) return slo;
	slo.overlapNeeded = Math.min(Math.max(overlap.topN - 1, 1), azure.topIds.length);
	slo.overlapOk = overlap.matched >= slo.overlapNeeded;
	return slo;
}

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

function parseTimeoutEnv(value: string | undefined, defaultValue: number): number {
	if (value === undefined || value.trim() === "") return defaultValue;
	const n = Number(value);
	if (!Number.isSafeInteger(n) || n < 100 || n > 30000) return defaultValue;
	return n;
}

/** Sample rate and kill switch from Worker vars. Defaults are safe and low: off, 1%, top 10, 3 s timeout. */
export function parseSearchShadowConfig(
	env: Pick<Env, "searchShadowEnabled" | "searchShadowSampleRate" | "searchShadowTopN" | "searchShadowTimeoutMs">
): SearchShadowConfig {
	return {
		enabled: parseBooleanEnv(env.searchShadowEnabled, DEFAULT_SEARCH_SHADOW_ENABLED),
		sampleRate: parseRateEnv(env.searchShadowSampleRate, DEFAULT_SEARCH_SHADOW_SAMPLE_RATE),
		topN: parseTopNEnv(env.searchShadowTopN, DEFAULT_SEARCH_SHADOW_TOP_N),
		timeoutMs: parseTimeoutEnv(env.searchShadowTimeoutMs, DEFAULT_SEARCH_SHADOW_TIMEOUT_MS)
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

function truncateError(value: string): string {
	return value.length <= SEARCH_SHADOW_ERROR_LIMIT ? value : value.slice(0, SEARCH_SHADOW_ERROR_LIMIT);
}

/**
 * Compact code/message from an Azure-shaped `{ error: { code, message } }` (or a string
 * `error`), else `status_N` when the caller only has a non-200 status.
 */
export function compactSearchError(body: unknown, status?: number): string | undefined {
	if (isRecord(body) && "error" in body) {
		const err = body.error;
		if (typeof err === "string" && err.trim()) {
			return truncateError(err.trim());
		}
		if (isRecord(err)) {
			const code = typeof err.code === "string" ? err.code.trim() : "";
			const message = typeof err.message === "string" ? err.message.trim() : "";
			const parts = [code, message].filter(Boolean);
			if (parts.length) return truncateError(parts.join(": "));
		}
	}
	if (status !== undefined && status !== 200) return `status_${status}`;
	return undefined;
}

function hasErrorEnvelope(body: unknown, topIds: string[]): boolean {
	return isRecord(body) && "error" in body && topIds.length === 0 && !Array.isArray(body.value);
}

/** Compact snapshot of one engine's answer, including a short error when the envelope has no hits. */
export function snapshotSearchResponse(status: number | undefined, latencyMs: number, body: unknown, topN: number, error?: string): SearchEngineSnapshot {
	const snap: SearchEngineSnapshot = {
		latencyMs: Math.max(0, Math.round(latencyMs)),
		count: null,
		topIds: []
	};
	if (status !== undefined) snap.status = status;
	if (isRecord(body)) {
		snap.topIds = hitIds(body.value, topN);
		snap.count = resultCount(body, snap.topIds.length);
	}
	if (error) {
		snap.error = truncateError(error);
	} else if ((status !== undefined && status !== 200) || hasErrorEnvelope(body, snap.topIds)) {
		const compact = compactSearchError(body, status);
		if (compact) snap.error = compact;
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
	/** Abort the D1 call after this long (default {@link DEFAULT_SEARCH_SHADOW_TIMEOUT_MS}). */
	timeoutMs?: number;
	log?: (payload: SearchShadowLog) => void;
	/** Soak dashboard store: one Analytics Engine data point per sample (cultpodcasts/Api#304). */
	analytics?: AnalyticsEngineDataset;
};

class ShadowTimeout extends Error {
	constructor() {
		super("timeout");
		this.name = "ShadowTimeout";
	}
}

/**
 * Query the D1 search Worker with the same rewritten body Azure just saw, then log a compact
 * comparison. Never throws: waitUntil work must not surface as an unhandled rejection.
 * The caller's Azure result is already on its way to the client.
 */
export async function runSearchShadow(args: SearchShadowRun): Promise<SearchShadowLog> {
	const write = args.log ?? ((payload: SearchShadowLog) => console.info(payload));
	const started = Date.now();
	const timeoutMs = args.timeoutMs ?? DEFAULT_SEARCH_SHADOW_TIMEOUT_MS;
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	// Race the whole call (answer and body) against the timeout, and abort it: a hung binding must
	// still produce a shadow line (as unavailable) rather than sit in waitUntil until the isolate dies.
	const timedOut = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new ShadowTimeout());
		}, timeoutMs);
	});
	const call = async (): Promise<SearchEngineSnapshot> => {
		const headers: Record<string, string> = {
			"content-type": "application/json;charset=UTF-8"
		};
		if (args.requestId) {
			headers["x-request-id"] = args.requestId;
		}
		const response = await args.fetcher.fetch(args.url, {
			method: "POST",
			headers,
			body: args.requestBody,
			signal: controller.signal
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
		const snap = snapshotSearchResponse(response.status, latencyMs, body, args.topN, error);
		const region = response.headers.get("x-search-served-by-region");
		if (region) snap.servedByRegion = region;
		const sessionConstraint = response.headers.get("x-search-session-constraint");
		if (sessionConstraint) snap.sessionConstraint = sessionConstraint;
		return snap;
	};
	let d1: SearchEngineSnapshot;
	try {
		const pending = call();
		// If the timeout wins, the aborted call rejects later; that rejection is expected and ignored.
		pending.catch(() => {});
		d1 = await Promise.race([pending, timedOut]);
	} catch (e) {
		d1 = {
			latencyMs: Math.max(0, Math.round(Date.now() - started)),
			count: null,
			topIds: [],
			error: e instanceof ShadowTimeout ? "timeout" : e instanceof Error ? e.message : String(e)
		};
	} finally {
		clearTimeout(timer);
	}
	const overlap = compareSearchSnapshots(args.azure.topIds, d1.topIds, args.topN);
	const payload: SearchShadowLog = {
		message: "search shadow",
		queryKind: searchQueryKind(args.query),
		azure: args.azure,
		d1,
		overlap,
		slo: shadowSlo(args.azure, d1, overlap)
	};
	if (args.requestId) payload.requestId = args.requestId;
	if (args.query) payload.query = args.query;
	if (args.filter) payload.filter = args.filter;
	write(payload);
	writeShadowDataPoint(args.analytics, payload);
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
