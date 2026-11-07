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
 * Unknown fields or syntax throw; the caller returns 400 like Azure does.
 */

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
}

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
  if (p.s[p.i] !== "'") throw new Error(`expected quoted value at ${p.i}`);
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
  throw new Error("unterminated quoted value");
}

function identifier(p: P): string {
  ws(p);
  const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(p.s.slice(p.i));
  if (!m) throw new Error(`expected identifier at ${p.i}`);
  p.i += m[0].length;
  return m[0];
}

function column(name: string): string {
  const col = FIELD_MAP[name];
  if (!col) throw new Error(`unknown field: ${name}`);
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

function searchInSql(name: string, values: string[], binds: unknown[]): string {
  const col = column(name);
  const parts: string[] = [];
  const plain = values.filter((v) => !(name === "lang" && v === "en"));
  if (name === "lang" && values.includes("en")) parts.push(`(${col} IS NULL OR ${col} = 'en')`);
  if (plain.length) {
    parts.push(`${col} IN (${plain.map(() => "?").join(",")})`);
    binds.push(...plain);
  }
  return parts.length === 1 ? parts[0] : `(${parts.join(" OR ")})`;
}

function parseSearchInArgs(p: P): string[] {
  // positioned just after "search.in(" with field already consumed up to comma
  if (!lit(p, ",")) throw new Error("search.in: expected ,");
  const list = quoted(p);
  let delim = ",";
  if (lit(p, ",")) delim = quoted(p) || ",";
  if (!lit(p, ")")) throw new Error("search.in: expected )");
  return list.split(delim).filter((v) => v !== "");
}

function clause(p: P, binds: unknown[]): string {
  ws(p);
  if (lit(p, "(")) {
    const inner = expr(p, binds);
    if (!lit(p, ")")) throw new Error("expected )");
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
    if (name !== "subjects") throw new Error(`unsupported collection: ${name}`); // pragma: allowlist secret
    if (!lit(p, "(")) throw new Error("any: expected (");
    const varName = identifier(p);
    if (!lit(p, ":")) throw new Error("any: expected :");
    let valueSql: string;
    const subBinds: unknown[] = [];
    if (lit(p, "search.in(")) {
      const v = identifier(p);
      if (v !== varName) throw new Error("any: variable mismatch");
      const values = parseSearchInArgs(p);
      valueSql = `s.subject IN (${values.map(() => "?").join(",")})`;
      subBinds.push(...values);
    } else {
      const v = identifier(p);
      if (v !== varName) throw new Error("any: variable mismatch");
      if (!lit(p, "eq")) throw new Error("any: expected eq");
      const value = quoted(p);
      valueSql = "s.subject = ?";
      subBinds.push(value);
    }
    if (!lit(p, ")")) throw new Error("any: expected )");
    binds.push(...subBinds);
    return `EXISTS (SELECT 1 FROM doc_subjects s WHERE s.rowid_ref = d.rowid AND ${valueSql})`; // pragma: allowlist secret
  }
  if (!lit(p, "eq")) throw new Error(`expected eq after ${name}`);
  if (lit(p, "null")) return eqSql(name, null, binds);
  return eqSql(name, quoted(p), binds);
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

/** Throws on unsupported syntax; caller maps that to a 400 like Azure. */
export function parseODataFilter(filter: string): SqlFilter {
  const p: P = { s: filter, i: 0 };
  const binds: unknown[] = [];
  const sql = expr(p, binds);
  ws(p);
  if (p.i !== p.s.length) throw new Error(`trailing input at ${p.i}`);
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
    throw new Error(`unsupported facet field: ${field}`);
  return { field, count };
}
