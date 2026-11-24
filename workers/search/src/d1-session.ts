import type { SearchEnv } from "./env";

export enum D1SessionConstraintMode {
	FirstUnconstrained = "first-unconstrained",
	FirstPrimary = "first-primary"
}

export enum SearchWorkerEngine {
	D1 = "d1"
}

export enum SearchWorkerRoute {
	Health = "/health",
	DocsSearch = "docs/search",
	AdminInventory = "/admin/docs/inventory",
	AdminDocs = "/admin/docs",
	AdminRebuild = "/admin/rebuild",
	Unknown = "unknown"
}

/**
 * D1 Sessions API read path (SP-1.2, cultpodcasts/Api#220).
 *
 * The search databases have global read replication on (`read_replication.mode = "auto"`,
 * Terraform module `infra/terraform/modules/search-stack`), but D1 only routes a query to a
 * replica when it runs through a session. Every read in this Worker therefore goes through
 * {@link readSession}; plain `env.SEARCH_DB.prepare` would always hit the primary in WEUR.
 *
 * `first-unconstrained`: the first query may go to the nearest replica (or the primary), and the
 * rest of the session sees a database at least as new as that first query (sequential
 * consistency). One session per request means the page's subject lookup (a second round trip
 * after the page/count/facet batch) never reads an older database than the page did.
 *
 * Search requests carry no bookmark: readers never write, and a page that is a few seconds behind
 * the primary is fine for search. Writes (the SP-1.4 admin route) stay on the primary.
 */
export const READ_SESSION_CONSTRAINT: D1SessionConstraint = D1SessionConstraintMode.FirstUnconstrained;

export function requestIdFromRequest(request: Request): string | undefined {
	const value = request.headers.get("x-request-id") ?? request.headers.get("cf-ray");
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

/** A read session on the search database for one request. */
export function readSession(env: SearchEnv): D1DatabaseSession {
	return env.SEARCH_DB.withSession(READ_SESSION_CONSTRAINT);
}

/**
 * The search database for writes (SP-1.4 admin route, `admin-docs.ts`). D1 always runs writes on
 * the primary, so there is no session: `batch()` on the database itself is one transaction.
 * Reads never use this; they go through {@link readSession}.
 */
export function writeDb(env: SearchEnv): D1Database {
	return env.SEARCH_DB;
}

/** Where a request's D1 queries ran, from each result's `meta` (logged for the SP-3 soak). */
export type ServedBy = {
	/** Distinct `served_by_region` values in query order, e.g. "EEUR" or "ENAM,WEUR"; null when D1 did not say. */
	servedByRegion: string | null;
	/** True when every query ran on the primary, false when any ran on a replica, null when D1 did not say. */
	servedByPrimary: boolean | null;
	/** Distinct `served_by_colo` values in query order; null when D1 did not say. */
	servedByColo: string | null;
	/** Sum of `timings.sql_duration_ms` (execution only, no network); null when D1 did not say. */
	sqlDurationMs: number | null;
	/** Number of D1 results the request read. */
	queries: number;
};

type Meta = Partial<Pick<D1Meta, "served_by_region" | "served_by_primary" | "served_by_colo" | "timings">>;

function distinct(values: (string | undefined)[]): string | null {
	const seen = [...new Set(values.filter((v): v is string => typeof v === "string" && v !== ""))];
	return seen.length ? seen.join(",") : null;
}

/** Summarises `meta` from every D1 result a request read. Missing fields (local, tests) become null. */
export function servedBy(results: readonly { meta?: Meta }[]): ServedBy {
	const metas = results.map((r) => r.meta ?? {});
	const primaries = metas.map((m) => m.served_by_primary).filter((p): p is boolean => typeof p === "boolean");
	const durations = metas.map((m) => m.timings?.sql_duration_ms).filter((d): d is number => typeof d === "number");
	return {
		servedByRegion: distinct(metas.map((m) => m.served_by_region)),
		servedByPrimary: primaries.length ? primaries.every(Boolean) : null,
		servedByColo: distinct(metas.map((m) => m.served_by_colo)),
		sqlDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) * 1000) / 1000 : null,
		queries: results.length
	};
}

/** Log line name; filter on it in Workers Observability (`message = "search: d1 read"`). */
export const D1_READ_LOG = "search: d1 read";

export type SearchReadLogContext = {
	requestId?: string;
	status?: number;
	durationMs?: number;
	attempts?: number;
	retryCount?: number;
};

/**
 * One structured log line per successful search request: which region and colo served it and
 * whether that was the primary. The soak (SP-3.2) charts replica use and latency by region from it.
 * Search traffic only (`/health` returns the region in its body instead). Unsampled; if volume ever
 * matters, set `observability.head_sampling_rate` in wrangler.search.jsonc rather than gating here.
 */
export function logServedBy(
	route: string,
	env: SearchEnv,
	results: readonly { meta?: Meta }[],
	context: SearchReadLogContext = {}
): void {
	const payload: Record<string, unknown> = {
		route,
		environment: env.searchEnvironment ?? "unknown",
		engine: SearchWorkerEngine.D1,
		sessionConstraint: READ_SESSION_CONSTRAINT,
		...servedBy(results)
	};
	if (context.requestId !== undefined) payload.requestId = context.requestId;
	if (context.status !== undefined) payload.status = context.status;
	if (context.durationMs !== undefined) payload.durationMs = context.durationMs;
	if (context.attempts !== undefined) payload.attempts = context.attempts;
	if (context.retryCount !== undefined) payload.retryCount = context.retryCount;
	console.log(D1_READ_LOG, payload);
}