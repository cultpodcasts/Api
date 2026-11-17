import { DOC_COLUMNS, toAzureSearchDocument, toAzureSearchEnvelope, type AzureSearchDocRow } from "./azure-response";
import { logServedBy, readSession } from "./d1-session";
import type { SearchEnv } from "./env";
import { SearchRequestError } from "./errors";
import { json } from "./health";
import { parseFacet, parseODataFilter } from "./odata";
import { toMatch, type SearchMode } from "./query";

/**
 * `POST /indexes/{index}/docs/search`: Azure AI Search docs/search over the search D1 database
 * (SP-1.9, cultpodcasts/Api#269; ported from the `search-demo/` prototype).
 *
 * Same request body the api Worker sends Azure today (`oDataSearchModel` plus what the website
 * sends): search, searchMode, filter, orderby, top/skip/count, facets and select. The index
 * name in the path is accepted as-is (one database per Worker), so the api Worker can keep its
 * Azure path and the parity harness can keep `/indexes/d1/…`. `api-version` and `api-key` are
 * ignored: the Worker is reachable only over a service binding.
 *
 * Errors: a bad body, filter or facet is 400 `{ error: { code, message } }` like Azure; a D1
 * failure or overload is 503 (retryable).
 *
 * Reads go through one D1 session per request (SP-1.2, {@link readSession}), so they can be
 * served by the nearest read replica, and each successful request logs where it was served.
 */
export type ODataSearchRequest = {
	search?: string;
	filter?: string;
	skip?: number | string;
	top?: number | string;
	count?: boolean;
	orderby?: string;
	facets?: string[];
	searchMode?: string;
	queryType?: string;
	/** Azure $select subset: comma-separated field names. */
	select?: string;
};

export const DOCS_SEARCH_PATH = /^\/indexes\/([^/]+)\/docs\/search$/;

/** D1's limit on bound parameters in one statement (developers.cloudflare.com/d1/platform/limits). */
export const D1_MAX_BOUND_PARAMETERS = 100;

/** Azure's default and maximum page size; a larger `top` is clamped, as Azure pages at 1000. */
const DEFAULT_TOP = 50;
const MAX_TOP = 1000;
/** Azure rejects `skip` above 100,000. */
export const MAX_SKIP = 100_000;
/** Our own caps (Azure's are not documented for POST bodies); generous for anything a person types. */
export const MAX_SEARCH_LENGTH = 8 * 1024;
export const MAX_FILTER_LENGTH = 32 * 1024;
export const MAX_BODY_LENGTH = 256 * 1024;

export async function docsSearch(request: Request, env: SearchEnv): Promise<Response> {
	let req: ODataSearchRequest;
	try {
		req = parseRequest(await request.text());
	} catch (e) {
		return badRequest(e);
	}
	try {
		return await runSearch(req, env, readSession(env));
	} catch (e) {
		if (e instanceof SearchRequestError) return badRequest(e);
		// D1 runtime failure (overload, timeout, reset, missing schema): retryable, never a 4xx.
		// The detail (SQL, schema names) goes to Workers logs only: since SP-1.5 the api Worker
		// forwards an upstream JSON error body to the browser.
		const message = (e instanceof Error ? e.message : String(e)).slice(0, ERROR_LOG_LIMIT);
		console.error("search: D1 failure", { message, name: e instanceof Error ? e.name : typeof e });
		return json(SERVICE_UNAVAILABLE, 503);
	}
}

/** Same cap as the api Worker's upstream error logging (UPSTREAM_ERROR_LOG_LIMIT, #268). */
const ERROR_LOG_LIMIT = 500;

export const SERVICE_UNAVAILABLE = {
	error: { code: "ServiceUnavailable", message: "Search is temporarily unavailable." }
} as const;

function badRequest(e: unknown): Response {
	// Azure's own 400 envelope leaves `code` empty and puts the reason in `message`.
	return json({ error: { code: "", message: e instanceof Error ? e.message : "bad request" } }, 400);
}

/** A non-negative integer (or integer string, as the demo accepted), else a 400. */
function nonNegativeInteger(name: string, value: unknown): number | undefined {
	if (value === undefined || value === null) return undefined;
	const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
	if (!Number.isSafeInteger(n) || n < 0) throw new SearchRequestError(`${name} must be a non-negative integer`);
	return n;
}

export function parseRequest(raw: string): ODataSearchRequest {
	if (raw.length > MAX_BODY_LENGTH) throw new SearchRequestError(`request body is too large (at most ${MAX_BODY_LENGTH} characters)`);
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		throw new SearchRequestError("request body is not valid JSON");
	}
	if (body === null || typeof body !== "object" || Array.isArray(body)) {
		throw new SearchRequestError("request body must be a JSON object");
	}
	const req = body as ODataSearchRequest;
	for (const key of ["search", "filter", "orderby", "searchMode", "queryType", "select"] as const) {
		if (req[key] !== undefined && req[key] !== null && typeof req[key] !== "string") {
			throw new SearchRequestError(`${key} must be a string`);
		}
	}
	if ((req.search?.length ?? 0) > MAX_SEARCH_LENGTH) {
		throw new SearchRequestError(`search is too long (at most ${MAX_SEARCH_LENGTH} characters)`);
	}
	if ((req.filter?.length ?? 0) > MAX_FILTER_LENGTH) {
		throw new SearchRequestError(`filter is too long (at most ${MAX_FILTER_LENGTH} characters)`);
	}
	const top = nonNegativeInteger("top", req.top);
	const skip = nonNegativeInteger("skip", req.skip);
	if (skip !== undefined && skip > MAX_SKIP) throw new SearchRequestError(`skip must be at most ${MAX_SKIP}`);
	req.top = top === undefined ? undefined : Math.min(top, MAX_TOP);
	req.skip = skip;
	if (req.facets !== undefined && req.facets !== null) {
		if (!Array.isArray(req.facets) || !req.facets.every((f) => typeof f === "string")) {
			throw new SearchRequestError("facets must be an array of strings");
		}
	}
	return req;
}

/**
 * ORDER BY for a page (SP-1.7, cultpodcasts/Api#224). Every order ends in `d.id`, so rows that tie
 * (same `release` second, same bm25 score) always come back in the same order and `skip` paging
 * never repeats or drops one. Azure breaks those ties arbitrarily, which is why same-second groups
 * shuffled between the two engines.
 *
 * - `release desc` (and browsing with no search text): newest first, ties by `id` ascending:
 *   exactly the order of `idx_search_docs_release (release DESC, id)`, so browse pages read the index
 *   without a sort.
 * - `release asc`: the exact reverse (`id` descending inside a tie), so the oldest-first list is the
 *   newest-first list read backwards, and the same index serves it scanned in reverse.
 * - Relevance (search text, no orderby): bm25 `rank`, ties by `id` ascending.
 *
 * `release` is ISO-8601 UTC text in one fixed format, so text order is time order.
 */
export function orderBy(orderby: string | undefined, searching: boolean): string {
	const ob = (orderby ?? "").trim().toLowerCase();
	if (ob === "release asc") return "ORDER BY d.release ASC, d.id DESC";
	if (ob === "release desc" || !searching) return "ORDER BY d.release DESC, d.id ASC";
	return "ORDER BY rank, d.id ASC";
}

/** `db` is the request's read session: every statement below must use it, never `env.SEARCH_DB`. */
async function runSearch(req: ODataSearchRequest, env: SearchEnv, db: D1DatabaseSession): Promise<Response> {
	const mode: SearchMode = req.searchMode === "all" ? "all" : "any";
	const matched = toMatch(req.search ?? "", mode);
	const match = matched.kind === "match" ? matched.expr : null;
	// parseRequest has already checked these are integers in range.
	const top = Number(req.top ?? DEFAULT_TOP);
	const skip = Number(req.skip ?? 0);

	const where: string[] = [];
	const binds: unknown[] = [];
	let from: string;
	let scoreSql = "1.0";
	if (match) {
		from = "search_fts JOIN search_docs d ON d.rowid = search_fts.rowid";
		// FTS5 rank (bm25): smaller is better; negate so higher = better like @search.score.
		// Column weights and title/AKA phrase-first ranking are SP-1.8.
		scoreSql = "-rank";
		where.push("search_fts MATCH ?");
		binds.push(match);
	} else {
		from = "search_docs d";
		if (matched.kind === "none") where.push("1 = 0"); // query text was all stopwords
	}
	if (req.filter?.trim()) {
		const parsed = parseODataFilter(req.filter);
		where.push(`(${parsed.sql})`);
		binds.push(...parsed.binds);
	}
	// Lists bind as one JSON parameter, so only a filter with ~100 separate comparisons gets here.
	// The main statement adds LIMIT and OFFSET.
	if (binds.length + 2 > D1_MAX_BOUND_PARAMETERS) {
		throw new SearchRequestError(`filter has too many values (at most ${D1_MAX_BOUND_PARAMETERS - 2} comparisons)`);
	}
	const facetSpecs = (req.facets ?? []).map(parseFacet);
	const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

	const orderSql = orderBy(req.orderby, match !== null);

	const select = `${scoreSql} AS score, ${DOC_COLUMNS.map((c) => `d.${c}`).join(", ")}`;
	const statements = [
		db.prepare(`SELECT ${select} FROM ${from} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`).bind(
			...binds,
			top,
			skip
		)
	];
	if (req.count) {
		statements.push(db.prepare(`SELECT COUNT(*) AS n FROM ${from} ${whereSql}`).bind(...binds));
	}
	for (const f of facetSpecs) {
		// f.count is a parsed integer (parseFacet), safe to inline.
		const facetSql =
			f.field === "subjects" // pragma: allowlist secret
				? `SELECT s.subject AS value, COUNT(*) AS count FROM ${from} JOIN doc_subjects s ON s.rowid_ref = d.rowid ${whereSql} GROUP BY s.subject ORDER BY count DESC LIMIT ${f.count}` // pragma: allowlist secret
				: f.field === "lang"
					? `SELECT COALESCE(d.lang, 'en') AS value, COUNT(*) AS count FROM ${from} ${whereSql} GROUP BY COALESCE(d.lang, 'en') ORDER BY count DESC LIMIT ${f.count}`
					: `SELECT ${f.field === "contentKind" ? "d.kind" : "d.series_name"} AS value, COUNT(*) AS count FROM ${from} ${whereSql} GROUP BY 1 ORDER BY count DESC LIMIT ${f.count}`;
		statements.push(db.prepare(facetSql).bind(...binds));
	}

	const results = await db.batch(statements);
	const reads: { meta?: D1Meta }[] = [...results];
	const docs = results[0].results as unknown as (AzureSearchDocRow & { score: number })[];
	const total = req.count ? (results[1].results[0] as { n: number }).n : undefined;
	const facetOffset = req.count ? 2 : 1;

	const want = req.select
		? new Set(
				req.select
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			)
		: null;
	const subjectsByDoc = new Map<number, string[]>(); // pragma: allowlist secret
	if (docs.length && (!want || want.has("subjects"))) { // pragma: allowlist secret
		const subjectRows = await db.prepare(
			// One JSON bind: a page can hold up to MAX_TOP hits, far past D1's 100-parameter limit.
			"SELECT rowid_ref, subject FROM doc_subjects WHERE rowid_ref IN (SELECT value FROM json_each(?))" // pragma: allowlist secret
		)
			.bind(JSON.stringify(docs.map((d) => d.rowid)))
			.all<{ rowid_ref: number; subject: string }>();
		reads.push(subjectRows);
		for (const row of subjectRows.results) {
			const list = subjectsByDoc.get(row.rowid_ref) ?? []; // pragma: allowlist secret
			list.push(row.subject);
			subjectsByDoc.set(row.rowid_ref, list); // pragma: allowlist secret
		}
	}

	const project = (full: Record<string, unknown>) => {
		if (!want) return full;
		const out: Record<string, unknown> = { "@search.score": full["@search.score"] };
		for (const k of want) if (k in full) out[k] = full[k];
		return out;
	};
	const facets: Record<string, unknown> = {};
	facetSpecs.forEach((f, idx) => {
		facets[f.field] = results[facetOffset + idx].results;
	});
	const body = toAzureSearchEnvelope(
		docs.map((d) => project(toAzureSearchDocument(d, d.score, subjectsByDoc.get(d.rowid) ?? []))), // pragma: allowlist secret
		{
			...(total !== undefined ? { count: total } : {}),
			...(facetSpecs.length ? { facets } : {})
		}
	);
	logServedBy("docs/search", env, reads);
	return json(body, 200);
}
