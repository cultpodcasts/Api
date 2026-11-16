import { DOC_COLUMNS, toAzureSearchDocument, toAzureSearchEnvelope, type AzureSearchDocRow } from "./azure-response";
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

/** Azure's default and maximum page size. */
const DEFAULT_TOP = 50;
const MAX_TOP = 1000;

export async function docsSearch(request: Request, env: SearchEnv): Promise<Response> {
	let req: ODataSearchRequest;
	try {
		req = parseRequest(await request.text());
	} catch (e) {
		return badRequest(e);
	}
	try {
		return await runSearch(req, env);
	} catch (e) {
		if (e instanceof SearchRequestError) return badRequest(e);
		// D1 runtime failure (overload, timeout, reset, missing schema): retryable, never a 4xx.
		return json(
			{ error: { code: "ServiceUnavailable", message: e instanceof Error ? e.message : String(e) } },
			503
		);
	}
}

function badRequest(e: unknown): Response {
	// Azure's own 400 envelope leaves `code` empty and puts the reason in `message`.
	return json({ error: { code: "", message: e instanceof Error ? e.message : "bad request" } }, 400);
}

export function parseRequest(raw: string): ODataSearchRequest {
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
	if (req.facets !== undefined && req.facets !== null) {
		if (!Array.isArray(req.facets) || !req.facets.every((f) => typeof f === "string")) {
			throw new SearchRequestError("facets must be an array of strings");
		}
	}
	return req;
}

async function runSearch(req: ODataSearchRequest, env: SearchEnv): Promise<Response> {
	const mode: SearchMode = req.searchMode === "all" ? "all" : "any";
	const matched = toMatch(req.search ?? "", mode);
	const match = matched.kind === "match" ? matched.expr : null;
	const top = Math.min(Math.max(Number(req.top ?? DEFAULT_TOP) || 0, 0), MAX_TOP);
	const skip = Math.max(Number(req.skip ?? 0) || 0, 0);

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

	// release is ISO-8601 UTC text in one fixed format, so text order is time order.
	// The `id` tie-break is SP-1.7.
	const ob = (req.orderby ?? "").trim().toLowerCase();
	const orderSql =
		ob === "release asc"
			? "ORDER BY d.release ASC"
			: ob === "release desc" || !match
				? "ORDER BY d.release DESC"
				: "ORDER BY rank";

	const select = `${scoreSql} AS score, ${DOC_COLUMNS.map((c) => `d.${c}`).join(", ")}`;
	const statements = [
		env.SEARCH_DB.prepare(`SELECT ${select} FROM ${from} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`).bind(
			...binds,
			top,
			skip
		)
	];
	if (req.count) {
		statements.push(env.SEARCH_DB.prepare(`SELECT COUNT(*) AS n FROM ${from} ${whereSql}`).bind(...binds));
	}
	for (const f of facetSpecs) {
		// f.count is a parsed integer (parseFacet), safe to inline.
		const facetSql =
			f.field === "subjects" // pragma: allowlist secret
				? `SELECT s.subject AS value, COUNT(*) AS count FROM ${from} JOIN doc_subjects s ON s.rowid_ref = d.rowid ${whereSql} GROUP BY s.subject ORDER BY count DESC LIMIT ${f.count}` // pragma: allowlist secret
				: f.field === "lang"
					? `SELECT COALESCE(d.lang, 'en') AS value, COUNT(*) AS count FROM ${from} ${whereSql} GROUP BY COALESCE(d.lang, 'en') ORDER BY count DESC LIMIT ${f.count}`
					: `SELECT ${f.field === "contentKind" ? "d.kind" : "d.series_name"} AS value, COUNT(*) AS count FROM ${from} ${whereSql} GROUP BY 1 ORDER BY count DESC LIMIT ${f.count}`;
		statements.push(env.SEARCH_DB.prepare(facetSql).bind(...binds));
	}

	const results = await env.SEARCH_DB.batch(statements);
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
		const subjectRows = await env.SEARCH_DB.prepare(
			// One JSON bind: a page can hold up to MAX_TOP hits, far past D1's 100-parameter limit.
			"SELECT rowid_ref, subject FROM doc_subjects WHERE rowid_ref IN (SELECT value FROM json_each(?))" // pragma: allowlist secret
		)
			.bind(JSON.stringify(docs.map((d) => d.rowid)))
			.all<{ rowid_ref: number; subject: string }>();
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
	return json(body, 200);
}
