/**
 * Relevance ranking for `docs/search` (SP-1.8, cultpodcasts/Api#225).
 *
 * Two layers, both in SQL so `top` / `skip` paging stays correct:
 *
 * 1. **Title / AKA phrase-first tiers** (required before cutover; Jon, 16 Nov 2026). For an
 *    unquoted query (no `"`, `+`, `-`, `|`, `*` or parentheses):
 *    - tier 0: the query *is* the document's title or one of its alternative titles (AKAs),
 *      compared after {@link normalizeTitle} (case, apostrophes, punctuation, spacing);
 *    - tier 1 (two or more words): the title or an AKA contains the query as whole words;
 *    - tier 2 (two or more words, optional): the exact phrase appears in any searchable field.
 *      This mirrors the api Worker's Azure rewrite (`"q"^10 OR (q)`, `src/boostUnquotedPhrase.ts`).
 *    Everything else is tier 3. Quoted, operator and single-word-substring searches are not tiered
 *    (quoted searches keep their own phrase semantics).
 * 2. **bm25 column weights** inside each tier: title and AKAs heaviest, then series name, subjects,
 *    description, guests and the hidden curator terms (FTS column order in migration 0001).
 *
 * `@search.score` is {@link relevanceScore}: `(3 - tier) * TIER_SCORE_STEP - bm25`, higher is
 * better as in Azure, and tier-first. Like Azure's, it is only meaningful within one result list.
 */

/** bm25 weight per FTS column, in the `search_fts` column order (migration 0001). */
export type ColumnWeights = {
	title: number;
	alternativeTitles: number;
	seriesName: number;
	subjects: number;
	description: number;
	guests: number;
	publisherSearchTerms: number;
	episodeSearchTerms: number;
};

export type RankingConfig = {
	weights: ColumnWeights;
	/** Tier 2: an unquoted multi-word query's exact phrase anywhere outranks scattered terms. */
	phraseAnywhereTier: boolean;
};

/**
 * Tuned with `npm run search:ranking` (workers/search/harness, 17 Nov 2026): the best top-10 overlap
 * with Azure among weights in the ticket's order (title = AKA > series name >= subjects >=
 * description > guests > curator terms), with the phrase-anywhere tier on. Azure has no scoring
 * profile, so near-equal weights track it best; heavy title weights cost overlap, and the tiers,
 * not the weights, are what put an exact title or AKA first. Guests and the curator terms are not
 * measurable (Azure never returns them), so they sit below description by the ticket's order.
 */
export const DEFAULT_RANKING: RankingConfig = {
	weights: {
		title: 1.5,
		alternativeTitles: 1.5,
		seriesName: 1.25,
		subjects: 1.25,
		description: 1,
		guests: 0.75,
		publisherSearchTerms: 0.5,
		episodeSearchTerms: 0.5
	},
	phraseAnywhereTier: true
};

/** Column order of `search_fts` (contract in migration 0001); bm25() takes weights in this order. */
const FTS_COLUMN_ORDER: (keyof ColumnWeights)[] = [
	"title",
	"alternativeTitles",
	"seriesName",
	"subjects",
	"description",
	"guests",
	"publisherSearchTerms",
	"episodeSearchTerms"
];

/** Score gap between tiers; bm25 magnitudes stay far below it. */
export const TIER_SCORE_STEP = 1000;

/** Characters removed (no space): apostrophes, so "father's" and "fathers" compare equal. */
const APOSTROPHES = ["'", "\u2019", "\u2018", "`"];
/** Characters that separate words. Kept short and explicit: JS and SQL must apply the same list. */
const SEPARATORS = [
	".", ",", ":", ";", "!", "?", "-", "\u2013", "\u2014", "/", "\\", "&", "(", ")", "[", "]",
	"{", "}", '"', "\u201c", "\u201d", "_", "+", "*", "#", "|", "~", "^", "\t", "\r"
];

/**
 * Title comparison form, mirrored exactly by {@link normalizedSql}: ASCII lower-case (SQLite's
 * `lower()` folds only ASCII), apostrophes removed, other punctuation to spaces, runs of spaces
 * collapsed, each line trimmed. Non-ASCII letters are compared as they are.
 */
export function normalizeTitle(text: string): string {
	let s = text.replace(/[A-Z]/g, (c) => c.toLowerCase());
	for (const a of APOSTROPHES) s = s.split(a).join("");
	for (const p of SEPARATORS) s = s.split(p).join(" ");
	return s
		.split("\n")
		.map((line) => line.replace(/ {2,}/g, " ").trim())
		.join("\n");
}

const sqlString = (s: string) => `'${s.replaceAll("'", "''")}'`;

/** SQL twin of {@link normalizeTitle} over a column (newlines kept: AKAs are one per line). */
export function normalizedSql(column: string): string {
	let e = `lower(coalesce(${column}, ''))`;
	for (const a of APOSTROPHES) e = `replace(${e}, ${sqlString(a)}, '')`;
	for (const p of SEPARATORS) e = `replace(${e}, ${sqlString(p)}, ' ')`;
	// Collapse up to 2^5 = 32 spaces in a row, then trim each line.
	for (let i = 0; i < 5; i++) e = `replace(${e}, '  ', ' ')`;
	e = `replace(replace(${e}, ' ' || char(10), char(10)), char(10) || ' ', char(10))`;
	return `trim(${e})`;
}

/**
 * True when the query has no simple-syntax operators, so it can be read as a title. Mirrors the
 * api Worker's `shouldBoostUnquotedPhrase` minus its whitespace check (single words count here).
 */
export function isUnquoted(search: string): boolean {
	const s = search.trim();
	if (!s) return false;
	if (/["|()*]/.test(s)) return false;
	if (/(^|\s)[+-]/.test(s)) return false;
	return true;
}

export type RankingSql = {
	/** `SELECT` expressions `tier` and `bm`; their bound values are `binds`, in order. */
	select: string;
	binds: unknown[];
	/** ORDER BY for a relevance page: tier, then bm25 (lower is better), then `d.id` so ties are stable. */
	order: string;
};

/** `@search.score` for a hit: higher is better and tier-first, like Azure's within one list. */
export function relevanceScore(tier: number, bm: number): number {
	return (3 - tier) * TIER_SCORE_STEP - bm;
}

/** Score and order SQL for a relevance search over `search_fts` joined to `search_docs d`. */
export function rankingSql(search: string, config: RankingConfig = DEFAULT_RANKING): RankingSql {
	const weights = FTS_COLUMN_ORDER.map((c) => {
		const w = config.weights[c];
		if (!Number.isFinite(w) || w < 0) throw new Error(`bad bm25 weight for ${c}`);
		return String(w);
	});
	const bm = `bm25(search_fts, ${weights.join(", ")})`;
	const order = "ORDER BY tier, bm, d.id";
	const text = search.trim().replace(/\s+/g, " ");
	const q = isUnquoted(text) ? normalizeTitle(text) : "";
	if (!q) return { select: `3 AS tier, ${bm} AS bm`, binds: [], order };

	const multiWord = q.includes(" ");
	const title = normalizedSql("d.title");
	const akas = normalizedSql("d.alternative_titles");
	const nl = "char(10)";
	const whens: string[] = [];
	const binds: unknown[] = [];
	// Tier 0: the whole title, or one whole AKA line.
	whens.push(`WHEN ${title} = ? OR instr(${nl} || ${akas} || ${nl}, ${nl} || ? || ${nl}) > 0 THEN 0`);
	binds.push(q, q);
	if (multiWord) {
		// Tier 1: the title, or one AKA line, contains the query as whole words.
		whens.push(
			`WHEN instr(' ' || ${title} || ' ', ' ' || ? || ' ') > 0 ` +
				`OR instr(' ' || replace(${akas}, ${nl}, ' ' || ${nl} || ' ') || ' ', ' ' || ? || ' ') > 0 THEN 1`
		);
		binds.push(q, q);
		if (config.phraseAnywhereTier) {
			// Tier 2: the exact phrase in any searchable field (the Azure rewrite's "q"^10).
			whens.push("WHEN d.rowid IN (SELECT rowid FROM search_fts WHERE search_fts MATCH ?) THEN 2");
			binds.push(`"${text.replaceAll('"', '""')}"`);
		}
	}
	return { select: `CASE ${whens.join(" ")} ELSE 3 END AS tier, ${bm} AS bm`, binds, order };
}

/** The api Worker's Azure rewrite of an unquoted query (`src/boostUnquotedPhrase.ts`): `"q"^N OR (terms)`. */
const AZURE_PHRASE_BOOST = /^"((?:[^"\\]|\\.)*)"\^\d+(?:\.\d+)? OR \((.*)\)$/s;

/**
 * Undo the api Worker's Azure-only phrase boost when it reaches D1 with `queryType: "full"`, so
 * D1 ranks the user's own unquoted text with its native tiers instead of reading `^10` as a term.
 * Anything else is returned unchanged.
 */
export function unwrapAzurePhraseBoost(search: string | undefined, queryType: string | undefined): string | undefined {
	if (search === undefined || (queryType ?? "").toLowerCase() !== "full") return search;
	const m = AZURE_PHRASE_BOOST.exec(search.trim());
	if (!m) return search;
	return m[1].replace(/\\(.)/g, "$1");
}
