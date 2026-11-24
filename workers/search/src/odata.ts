/**
 * The OData subset the website actually sends (see search-api / subject-api
 * components), translated to SQL over search_docs/doc_subjects:
 *
 *   expr        := clause ( ('and' | 'or') clause )*
 *   clause      := '(' expr ')' | comparison | searchIn | subjectsAny
 *   comparison  := field 'eq' ( 'quoted' | null )
 *   searchIn    := search.in(field, 'a£b', '£')
 *   subjectsAny := subjects/any(s: s eq 'X')
 *                | subjects/any(s: search.in(s, 'a£b', '£'))
 *
 * Values use OData quote-doubling (''). Field names map to D1 columns;
 * seriesName and legacy podcastName are the same column. lang NULL = English.
 * Unknown fields or syntax throw SearchRequestError; the route returns 400 like Azure does.
 *
 * `parseODataFilter` always emits a boolean predicate. A top-level `subjects/any`
 * joined with `and` is not left in that predicate: {@link applyODataFilter} lifts it
 * into a `subject_hits` join so the subject index drives the plan. `any()` under `or`
 * stays a predicate, because a join would drop rows that disjunct should keep.
 * Search migrations never ANALYZE, so a WHERE `IN` plus `(lang eq null or lang eq 'en')`
 * is planned as a walk of `idx_search_docs_lang` (#319).
 *
 * Ported from the `search-demo/` prototype (SP-1.9, cultpodcasts/Api#269).
 */

import { SearchRequestError } from "./errors";

const FIELD_MAP: Record<string, string> = {
	seriesName: "d.series_name",
	podcastName: "d.series_name",
	contentKind: "d.kind",
	lang: "d.lang",
	id: "d.id",
	title: "d.title",
};

export interface SqlFilter {
	sql: string;
	binds: unknown[];
}

interface P {
	s: string;
	i: number;
	/** Current parenthesis / any() nesting, capped so deep input is a 400, not a stack overflow. */
	depth: number;
}

/** Deepest filter nesting accepted; the website sends at most two or three levels. */
export const MAX_FILTER_DEPTH = 32;

const ws = (p: P) => {
	while (p.i < p.s.length && /\s/.test(p.s[p.i])) p.i++;
};

function lit(p: P, text: string): boolean {
	ws(p);
	if (p.s.slice(p.i, p.i + text.length).toLowerCase() === text.toLowerCase()) {
		p.i += text.length;
		return true;
	}
	return false;
}

function quoted(p: P): string {
	ws(p);
	if (p.s[p.i] !== "'") throw new SearchRequestError(`expected quoted value at ${p.i}`);
	p.i++;
	let out = "";
	while (p.i < p.s.length) {
		if (p.s[p.i] === "'") {
			if (p.s[p.i + 1] === "'") {
				out += "'";
				p.i += 2;
				continue;
			}
			p.i++;
			return out;
		}
		out += p.s[p.i++];
	}
	throw new SearchRequestError("unterminated quoted value");
}

function identifier(p: P): string {
	ws(p);
	const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(p.s.slice(p.i));
	if (!m) throw new SearchRequestError(`expected identifier at ${p.i}`);
	p.i += m[0].length;
	return m[0];
}

function column(name: string): string {
	const col = FIELD_MAP[name];
	if (!col) throw new SearchRequestError(`unknown field: ${name}`);
	return col;
}

/** lang comparisons honour the "NULL = English" storage contract. */
function eqSql(name: string, value: string | null, binds: unknown[]): string {
	const col = column(name);
	if (value === null) return `${col} IS NULL`;
	if (name === "lang" && value === "en") return `(${col} IS NULL OR ${col} = 'en')`;
	binds.push(value);
	return `${col} = ?`;
}

/** `id ne '…'` (related-rails exclude-self). NULL-safe so nullable columns still match. */
function neSql(name: string, value: string | null, binds: unknown[]): string {
	const col = column(name);
	if (value === null) return `${col} IS NOT NULL`;
	binds.push(value);
	return `(${col} IS NULL OR ${col} <> ?)`;
}

function searchInSql(name: string, values: string[], binds: unknown[]): string {
	const col = column(name);
	const parts: string[] = [];
	const plain = values.filter((v) => !(name === "lang" && v === "en"));
	if (name === "lang" && values.includes("en")) parts.push(`(${col} IS NULL OR ${col} = 'en')`);
	if (plain.length) {
		// One JSON bind however long the list: D1 allows at most 100 bound parameters per query.
		parts.push(`${col} IN (SELECT value FROM json_each(?))`);
		binds.push(JSON.stringify(plain));
	}
	// Empty list (`search.in(f, '')`) matches nothing, as in Azure.
	if (!parts.length) return "0 = 1";
	return parts.length === 1 ? parts[0] : `(${parts.join(" OR ")})`;
}

function parseSearchInArgs(p: P): string[] {
	// positioned just after "search.in(" with field already consumed up to comma
	if (!lit(p, ",")) throw new SearchRequestError("search.in: expected ,");
	const list = quoted(p);
	let delim = ",";
	if (lit(p, ",")) delim = quoted(p) || ",";
	if (!lit(p, ")")) throw new SearchRequestError("search.in: expected )");
	return list.split(delim).filter((v) => v !== "");
}

function clause(p: P, binds: unknown[]): string {
	ws(p);
	if (lit(p, "(")) {
		if (++p.depth > MAX_FILTER_DEPTH) {
			throw new SearchRequestError(`filter is nested too deeply (at most ${MAX_FILTER_DEPTH} levels)`);
		}
		const inner = expr(p, binds);
		if (!lit(p, ")")) throw new SearchRequestError("expected )");
		p.depth--;
		return `(${inner})`;
	}
	if (lit(p, "search.in(")) {
		const field = identifier(p);
		const values = parseSearchInArgs(p);
		return searchInSql(field, values, binds);
	}
	const name = identifier(p);
	if (lit(p, "/any")) {
		// subjects/any(s: s eq 'X')  or  subjects/any(s: search.in(s, 'a£b', '£')) // pragma: allowlist secret
		if (name !== "subjects") throw new SearchRequestError(`unsupported collection: ${name}`); // pragma: allowlist secret
		const value = anyValueSql(p);
		binds.push(...value.binds);
		return `d.rowid IN (SELECT s.rowid_ref FROM doc_subjects s WHERE ${value.sql})`; // pragma: allowlist secret
	}
	if (lit(p, "eq")) {
		if (lit(p, "null")) return eqSql(name, null, binds);
		return eqSql(name, quoted(p), binds);
	}
	if (lit(p, "ne")) {
		if (lit(p, "null")) return neSql(name, null, binds);
		return neSql(name, quoted(p), binds);
	}
	throw new SearchRequestError(`expected eq/ne after ${name}`);
}

function expr(p: P, binds: unknown[]): string {
	let left = clause(p, binds);
	for (;;) {
		ws(p);
		if (lit(p, "and ")) left = `${left} AND ${clause(p, binds)}`;
		else if (lit(p, "or ")) left = `${left} OR ${clause(p, binds)}`;
		else return left;
	}
}

/** The predicate inside `subjects/any(...)`, with `s` as the doc_subjects alias. */
function anyValueSql(p: P): SqlFilter {
	if (!lit(p, "(")) throw new SearchRequestError("any: expected (");
	const varName = identifier(p);
	if (!lit(p, ":")) throw new SearchRequestError("any: expected :");
	let valueSql: string;
	const subBinds: unknown[] = [];
	if (lit(p, "search.in(")) {
		const v = identifier(p);
		if (v !== varName) throw new SearchRequestError("any: variable mismatch");
		const values = parseSearchInArgs(p);
		if (values.length) {
			valueSql = "s.subject IN (SELECT value FROM json_each(?))";
			subBinds.push(JSON.stringify(values));
		} else valueSql = "0 = 1";
	} else {
		const v = identifier(p);
		if (v !== varName) throw new SearchRequestError("any: variable mismatch");
		if (!lit(p, "eq")) throw new SearchRequestError("any: expected eq");
		const value = quoted(p);
		valueSql = "s.subject = ?";
		subBinds.push(value);
	}
	if (!lit(p, ")")) throw new SearchRequestError("any: expected )");
	return { sql: valueSql, binds: subBinds };
}

/**
 * `text` is exactly one `subjects/any` call (optional surrounding parentheses already removed).
 * Returns the inner subject predicate. Null when `text` is some other clause, including an
 * `any()` that is only the start of a larger expression (`any() or …`).
 */
function subjectHitValue(text: string): SqlFilter | null {
	const p: P = { s: text.trim(), i: 0, depth: 0 };
	if (!lit(p, "subjects/any")) return null; // pragma: allowlist secret
	ws(p);
	if (p.s[p.i] !== "(") return null;
	const value = anyValueSql(p);
	ws(p);
	if (p.i !== p.s.length) return null;
	return value;
}

type BoolOp = "and" | "or";

/** Top-level `and` / `or` only. Operators inside parentheses or quotes stay in a part. */
function splitTopLevel(filter: string): { parts: string[]; ops: BoolOp[] } {
	const parts: string[] = [];
	const ops: BoolOp[] = [];
	let start = 0;
	let depth = 0;
	let i = 0;
	while (i < filter.length) {
		const c = filter[i];
		if (c === "'") {
			i++;
			while (i < filter.length) {
				if (filter[i] === "'") {
					if (filter[i + 1] === "'") {
						i += 2;
						continue;
					}
					i++;
					break;
				}
				i++;
			}
			continue;
		}
		if (c === "(") {
			depth++;
			i++;
			continue;
		}
		if (c === ")") {
			depth--;
			i++;
			continue;
		}
		if (depth === 0) {
			const op = /^\s+(and|or)\s+/i.exec(filter.slice(i));
			if (op) {
				parts.push(filter.slice(start, i));
				ops.push(op[1].toLowerCase() as BoolOp);
				i += op[0].length;
				start = i;
				continue;
			}
		}
		i++;
	}
	parts.push(filter.slice(start));
	return { parts, ops };
}

/** Unwrap parentheses that surround the whole clause, so `(subjects/any(...))` can be lifted. */
function unwrapClause(raw: string): string {
	let text = raw.trim();
	for (;;) {
		if (!text.startsWith("(") || !text.endsWith(")")) return text;
		let depth = 0;
		let closedEarly = false;
		for (let i = 0; i < text.length; i++) {
			const c = text[i];
			if (c === "'") {
				i++;
				while (i < text.length) {
					if (text[i] === "'") {
						if (text[i + 1] === "'") {
							i++;
							continue;
						}
						break;
					}
					i++;
				}
				continue;
			}
			if (c === "(") depth++;
			else if (c === ")") {
				depth--;
				if (depth === 0 && i < text.length - 1) {
					closedEarly = true;
					break;
				}
			}
		}
		if (closedEarly || depth !== 0) return text;
		text = text.slice(1, -1).trim();
	}
}

/**
 * One lifted `subjects/any`. `sql` is the CTE body (`SELECT rowid_ref …`).
 * Its binds are the first placeholders in the statement, because the CTE is written before SELECT.
 */
export interface SubjectHitCte {
	alias: string;
	sql: string;
	binds: unknown[];
}

/**
 * Filter SQL for docs/search. Top-level `subjects/any` AND conjuncts become
 * {@link SubjectHitCte}s. Everything else, including `any()` under `or`, stays in `whereSql`.
 */
export interface AppliedODataFilter {
	whereSql: string;
	whereBinds: unknown[];
	subjectHits: SubjectHitCte[];
}

export function applyODataFilter(filter: string): AppliedODataFilter {
	const split = splitTopLevel(filter);
	if (split.ops.includes("or")) {
		const parsed = parseODataFilter(filter);
		return { whereSql: `(${parsed.sql})`, whereBinds: parsed.binds, subjectHits: [] };
	}
	const predicates: string[] = [];
	const whereBinds: unknown[] = [];
	const subjectHits: SubjectHitCte[] = [];
	for (const part of split.parts) {
		const hit = subjectHitValue(unwrapClause(part));
		if (hit) {
			const alias = subjectHits.length === 0 ? "subject_hits" : `subject_hits_${subjectHits.length + 1}`;
			subjectHits.push({
				alias,
				sql: `SELECT s.rowid_ref FROM doc_subjects s WHERE ${hit.sql}`, // pragma: allowlist secret
				binds: hit.binds
			});
			continue;
		}
		const parsed = parseODataFilter(part);
		predicates.push(`(${parsed.sql})`);
		whereBinds.push(...parsed.binds);
	}
	return { whereSql: predicates.join(" AND "), whereBinds, subjectHits };
}

/** Throws SearchRequestError on unsupported syntax; the route maps that to a 400 like Azure. */
export function parseODataFilter(filter: string): SqlFilter {
	const p: P = { s: filter, i: 0, depth: 0 };
	const binds: unknown[] = [];
	const sql = expr(p, binds);
	ws(p);
	if (p.i !== p.s.length) throw new SearchRequestError(`trailing input at ${p.i}`);
	return { sql, binds };
}

export interface FacetSpec {
	field: string;
	count: number;
}

/** "seriesName,count:1000,sort:count" -> { field, count } (sort is always count). */
export function parseFacet(spec: string): FacetSpec {
	const [field, ...opts] = spec.split(",").map((s) => s.trim());
	let count = 10;
	for (const o of opts) {
		const m = /^count:(\d+)$/.exec(o);
		if (m) count = Math.min(Number(m[1]), 1000);
	}
	if (!["seriesName", "podcastName", "contentKind", "lang", "subjects"].includes(field)) // pragma: allowlist secret
		throw new SearchRequestError(`unsupported facet field: ${field}`);
	return { field, count };
}
