/**
 * Azure AI Search "simple" query syntax -> SQLite FTS5 MATCH translator.
 *
 * The website sends queryType:'simple', searchMode:'any'. Semantics mirrored:
 *   term term     -> OR between atoms when mode=any, AND when mode=all
 *   +             -> AND
 *   |             -> OR
 *   -term         -> NOT term (at a term boundary only)
 *   "a b"         -> phrase
 *   term*         -> prefix
 *   ( )           -> treated as whitespace (grouping is rare in sent queries;
 *                    dropping parens keeps the expression valid for FTS5)
 *
 * Every atom is emitted as a double-quoted FTS5 string (inner quotes doubled),
 * so user text can never inject FTS5 syntax. The expression is folded
 * left-to-right with explicit parentheses, which makes binding deterministic.
 * A leading/solitary negated atom has nothing to subtract from and is dropped.
 */

export type SearchMode = "any" | "all";

interface Atom {
  text: string; // raw inner text (phrase or term), unescaped
  prefix: boolean;
  negated: boolean;
}

type Op = "AND" | "OR";

export function toMatchExpression(q: string, mode: SearchMode = "any"): string | null {
  const defaultOp: Op = mode === "all" ? "AND" : "OR";
  const atoms: { atom: Atom; op: Op }[] = [];

  let i = 0;
  let pendingOp: Op | null = null;
  let negate = false;
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
      if (inner.trim()) push({ text: inner, prefix, negated: negate });
      else negate = false;
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
    // Uppercase AND/OR/NOT read as operators (users type them expecting boolean logic).
    if (term === "AND") {
      pendingOp = "AND";
      continue;
    }
    if (term === "OR") {
      pendingOp = "OR";
      continue;
    }
    if (term === "NOT") {
      negate = true;
      continue;
    }
    if (term) push({ text: term, prefix, negated: negate });
  }

  const render = (a: Atom) => `"${a.text.replaceAll('"', '""')}"${a.prefix ? " *" : ""}`;

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
  return expr;
}
