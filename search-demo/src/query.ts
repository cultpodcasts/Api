/**
 * Azure AI Search "simple" query syntax -> SQLite FTS5 MATCH translator.
 *
 * The website sends queryType:'simple', searchMode:'any'. Semantics mirrored:
 *   term term     -> OR between atoms when mode=any, AND when mode=all
 *   +             -> AND
 *   |             -> OR
 *   -term         -> NOT term (at a term boundary only)
 *   AND / OR / NOT-> plain terms, not operators (simple syntax has no keywords;
 *                    the stopword filter then drops and/or/not, matching Azure)
 *   "a b"         -> phrase
 *   term*         -> prefix
 *   ( )           -> treated as whitespace (grouping is rare in sent queries;
 *                    dropping parens keeps the expression valid for FTS5)
 *
 * en.lucene analyzer behaviours mirrored query-side (the FTS index uses the
 * porter tokenizer, matching Lucene's Porter stemmer; see the parity harness):
 *   - bare English stopwords are dropped, like EnglishAnalyzer's StopFilter
 *     (kept inside phrases: FTS5 phrases are strictly adjacent, and documents
 *     containing the phrase carry the stopword tokens)
 *   - hyphenated bare terms split into independent atoms (StandardTokenizer
 *     splits "ex-mormon" into two tokens that searchMode=any ORs together)
 *   - possessive bare terms ("heaven's") also match the stripped form, like
 *     EnglishPossessiveFilter
 *
 * Every atom is emitted as a double-quoted FTS5 string (inner quotes doubled),
 * so user text can never inject FTS5 syntax. The expression is folded
 * left-to-right with explicit parentheses, which makes binding deterministic.
 * A leading/solitary negated atom has nothing to subtract from and is dropped.
 */

export type SearchMode = "any" | "all";

/** Lucene EnglishAnalyzer default stop set. */
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "if", "in",
  "into", "is", "it", "no", "not", "of", "on", "or", "such", "that", "the",
  "their", "then", "there", "these", "they", "this", "to", "was", "will", "with",
]);

interface Atom {
  text: string; // raw inner text (phrase or term), unescaped
  phrase: boolean;
  prefix: boolean;
  negated: boolean;
}

type Op = "AND" | "OR";

export type MatchResult =
  | { kind: "match"; expr: string }
  | { kind: "browse" } // no query text: unfiltered browse
  | { kind: "none" }; // query text present but nothing searchable (e.g. all stopwords)

export function toMatch(q: string, mode: SearchMode = "any"): MatchResult {
  const defaultOp: Op = mode === "all" ? "AND" : "OR";
  const atoms: { atom: Atom; op: Op }[] = [];

  let i = 0;
  let pendingOp: Op | null = null;
  let negate = false;
  let sawText = false;
  const n = q.length;

  const push = (atom: Atom) => {
    atoms.push({ atom, op: pendingOp ?? defaultOp });
    pendingOp = null;
    negate = false;
  };

  while (i < n) {
    const c = q[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "(" || c === ")") {
      i++;
      continue;
    }
    if (c === "+") {
      pendingOp = "AND";
      i++;
      continue;
    }
    if (c === "|") {
      pendingOp = "OR";
      i++;
      continue;
    }
    if (c === "-") {
      negate = true;
      i++;
      continue;
    }
    if (c === '"') {
      const end = q.indexOf('"', i + 1);
      const inner = end === -1 ? q.slice(i + 1) : q.slice(i + 1, end);
      i = end === -1 ? n : end + 1;
      let prefix = false;
      if (q[i] === "*") {
        prefix = true;
        i++;
      }
      if (inner.trim()) {
        sawText = true;
        push({ text: inner, phrase: true, prefix, negated: negate });
      } else negate = false;
      continue;
    }
    // Bare term: runs to the next operator/boundary character.
    let j = i;
    while (j < n && !' \t\n\r+|"()'.includes(q[j])) j++;
    let term = q.slice(i, j);
    i = j;
    let prefix = false;
    if (term.endsWith("*")) {
      prefix = true;
      term = term.replace(/\*+$/, "");
    }
    // No AND/OR/NOT keywords: Azure "simple" syntax treats them as plain terms
    // (verified live: `scientology AND "paulette cooper"` returns the OR result
    // on production Azure). As bare terms they are then stopword-dropped.
    if (!term) continue;
    sawText = true;
    // StandardTokenizer splits on hyphens/slashes; searchMode joins the pieces.
    // A negated compound stays whole so NOT keeps sane semantics.
    const pieces = negate ? [term] : term.split(/[-–—/]+/).filter(Boolean);
    let pushedAny = false;
    for (const piece of pieces) {
      const bare = piece.replace(/^['’.]+|['’.]+$/g, "");
      if (!bare) continue;
      if (STOPWORDS.has(bare.toLowerCase()) && !negate) continue; // StopFilter
      push({ text: bare, phrase: false, prefix: prefix && piece === pieces[pieces.length - 1], negated: negate });
      pushedAny = true;
    }
    if (!pushedAny) negate = false;
  }

  const renderString = (text: string, prefix: boolean) => `"${text.replaceAll('"', '""')}"${prefix ? " *" : ""}`;

  /** Possessive bare terms also match the stripped form (EnglishPossessiveFilter). */
  const render = (a: Atom) => {
    if (!a.phrase) {
      const m = /^(.+)[\u2019']s$/i.exec(a.text);
      if (m) return `(${renderString(a.text, a.prefix)} OR ${renderString(m[1], a.prefix)})`;
    }
    return renderString(a.text, a.prefix);
  };

  let expr: string | null = null;
  for (const { atom, op } of atoms) {
    if (expr === null) {
      if (atom.negated) continue; // nothing on the left to subtract from
      expr = render(atom);
    } else if (atom.negated) {
      expr = `(${expr}) NOT ${render(atom)}`;
    } else {
      expr = `(${expr}) ${op} ${render(atom)}`;
    }
  }
  if (expr !== null) return { kind: "match", expr };
  return sawText ? { kind: "none" } : { kind: "browse" };
}

/** Back-compat shim: null = browse OR nothing-searchable (callers that only filter). */
export function toMatchExpression(q: string, mode: SearchMode = "any"): string | null {
  const r = toMatch(q, mode);
  return r.kind === "match" ? r.expr : null;
}
