/**
 * SP-1.8 ranking harness (cultpodcasts/Api#225): D1 top-10 against Azure's top-10, and the
 * title/AKA phrase-first gate.
 *
 *   npm run search:ranking            # measure DEFAULT_RANKING (and the pre-SP-1.8 baseline)
 *   SEARCH_RANKING_TUNE=1 npm run search:ranking   # also grid-search the bm25 weights
 *
 * Azure side: the public `POST /search` on the api Worker (`SEARCH_HARNESS_URL`, default
 * https://api.cultpodcasts.com/search), read-only, exactly what the website sends. That includes the
 * api Worker's unquoted-phrase boost, which is the behaviour D1 must match. Responses are cached in
 * `.cache/` (gitignored); delete it to refresh.
 *
 * D1 side: the production query engine (`docsSearch`) over an in-memory copy of the migrated schema,
 * loaded with every document Azure returned for the query set (top 50 each), the top 50 for each
 * word of the title/AKA queries (the documents that compete with a title on its words), and every film.
 *
 * Limits of the measurement, by construction: the corpus is a few thousand documents, not ~89k, so
 * bm25's IDF differs; Azure returns descriptions cut to its ~100-character index cap, and never
 * returns guests or the curator terms, so those columns are empty here and their weights are set by
 * the ticket's order rather than measured.
 *
 * Writes `out/ranking-report.md` (gitignored).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { docsSearch } from "../src/docs-search";
import { DEFAULT_RANKING, normalizeTitle, type RankingConfig } from "../src/ranking";
import { d1, migratedSearchDb, upsertSearchDoc } from "../../../tests/support/searchD1";
import { exactAka, exactTitle, freeText, quoted } from "./cases";

const HERE = resolve(process.cwd(), "workers/search/harness");
const CACHE = resolve(HERE, ".cache");
const OUT = resolve(HERE, "out");
const URL_ = process.env.SEARCH_HARNESS_URL ?? "https://api.cultpodcasts.com/search";

type AzureDoc = Record<string, any> & { id: string };
type AzureResult = { count: number; value: AzureDoc[] };

async function azure(body: Record<string, unknown>): Promise<AzureResult> {
	mkdirSync(CACHE, { recursive: true });
	const key = Buffer.from(JSON.stringify(body)).toString("base64url").slice(0, 180);
	const file = resolve(CACHE, `${key}.json`);
	if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
	await new Promise((r) => setTimeout(r, 400)); // polite: one request at a time, spaced
	const resp = await fetch(URL_, {
		method: "POST",
		headers: { "content-type": "application/json", origin: "https://cultpodcasts.com", "user-agent": "cultpodcasts-ranking-harness" },
		body: JSON.stringify({ searchMode: "any", queryType: "simple", count: true, skip: 0, facets: [], filter: "", orderby: "", ...body })
	});
	if (!resp.ok) throw new Error(`Azure ${resp.status} for ${JSON.stringify(body)}`);
	const json = (await resp.json()) as any;
	const result = { count: json["@odata.count"] ?? 0, value: json.value as AzureDoc[] };
	writeFileSync(file, JSON.stringify(result));
	return result;
}

/** Azure document → search_docs row (what the SP-1.4 write path stores). */
function load(db: DatabaseSync, doc: AzureDoc) {
	const lines = (v?: string[] | null) => (v?.length ? v.join("\n") : null);
	upsertSearchDoc(
		db,
		{
			id: doc.id,
			kind: doc.contentKind ?? "Episode",
			title: doc.title ?? null,
			series_name: doc.seriesName ?? null,
			description: doc.description ?? null,
			alternative_titles: lines(doc.alternativeTitles),
			release: doc.release,
			duration: doc.duration ?? "00:00:00",
			lang: doc.lang ?? null,
			image: doc.image ?? null,
			trailers: doc.trailers?.length ? JSON.stringify(doc.trailers) : null,
			tmdb_id: doc.tmdbId ?? null
		},
		doc.subjects ?? []
	);
}

const allQueries = () => [...freeText, ...exactTitle.map((c) => c.query), ...exactAka.map((c) => c.query), ...quoted];

async function corpus() {
	const azureTop: Record<string, string[]> = {};
	const docs = new Map<string, AzureDoc>();
	for (const q of allQueries()) {
		const r = await azure({ search: q, top: 50 });
		azureTop[q] = r.value.slice(0, 10).map((d) => d.id);
		for (const d of r.value) docs.set(d.id, d);
	}
	// Competitors for the title/AKA gate: the top 50 for each word of each title query, so the
	// corpus holds the documents that out-score a title on its words alone (as the full index does).
	const words = new Set(
		[...exactTitle, ...exactAka].flatMap((c) => normalizeTitle(c.query).split(" ")).filter((w) => w.length > 3)
	);
	for (const w of words) for (const d of (await azure({ search: w, top: 50 })).value) docs.set(d.id, d);
	const films = await azure({ search: "", filter: "contentKind eq 'Film'", top: 1000, orderby: "release desc" });
	for (const d of films.value) docs.set(d.id, d);
	const db = migratedSearchDb();
	for (const d of docs.values()) load(db, d);
	return { db, azureTop, docs };
}

async function d1Top(db: DatabaseSync, q: string, ranking: RankingConfig, top = 10): Promise<AzureDoc[]> {
	const resp = await docsSearch(
		new Request("https://search.internal/indexes/h/docs/search", {
			method: "POST",
			body: JSON.stringify({ search: q, searchMode: "any", queryType: "simple", top })
		}),
		{ SEARCH_DB: d1(db) },
		ranking
	);
	return ((await resp.json()) as any).value;
}

/** The first hit's title or one of its AKAs is the query (another document may share the exact title). */
const isTitleOrAka = (doc: AzureDoc | undefined, query: string) =>
	!!doc && [doc.title ?? "", ...(doc.alternativeTitles ?? [])].some((t: string) => normalizeTitle(t) === normalizeTitle(query.replace(/\s+/g, " ").trim()));

type Score = { overlap: number; maxOverlap: number; titleFirst: number; titleCases: number; perQuery: Record<string, number>; misses: string[] };

async function evaluate(db: DatabaseSync, azureTop: Record<string, string[]>, ranking: RankingConfig): Promise<Score> {
	const perQuery: Record<string, number> = {};
	let overlap = 0;
	let maxOverlap = 0;
	for (const q of [...freeText, ...quoted]) {
		const az = new Set(azureTop[q]);
		const mine = (await d1Top(db, q, ranking)).map((d) => d.id);
		perQuery[q] = mine.filter((id) => az.has(id)).length;
		overlap += perQuery[q];
		maxOverlap += Math.min(10, az.size);
	}
	let titleFirst = 0;
	const titleCases = [...exactTitle, ...exactAka];
	const misses: string[] = [];
	for (const c of titleCases) {
		const top3 = await d1Top(db, c.query, ranking, 3);
		const ok = isTitleOrAka(top3[0], c.query);
		if (ok) titleFirst++;
		else misses.push(`\`${c.query}\` → ${top3.map((d) => `"${d.title}" (${d.contentKind})`).join(", ")}`);
		perQuery[c.query] = ok ? 1 : 0;
	}
	return { overlap, maxOverlap, titleFirst, titleCases: titleCases.length, perQuery, misses };
}

/** SP-1.9 behaviour before this ticket: plain bm25 (all weights 1), no tiers. */
const BASELINE: RankingConfig = {
	weights: { title: 1, alternativeTitles: 1, seriesName: 1, subjects: 1, description: 1, guests: 1, publisherSearchTerms: 1, episodeSearchTerms: 1 },
	phraseAnywhereTier: false
};

/**
 * Weights in the ticket's order: title = AKA > series name >= subjects >= description, then guests
 * and the curator terms below description (unmeasurable here: Azure never returns them).
 */
function* grid(): Generator<RankingConfig> {
	for (const title of [1.5, 2, 3, 4, 6])
		for (const seriesName of [1, 1.25, 1.5, 2, 3])
			for (const subjects of [1, 1.25, 1.5, 2])
				for (const description of [0.5, 0.75, 1])
					for (const phraseAnywhereTier of [true, false]) {
						if (!(title > seriesName && seriesName >= subjects && subjects >= description)) continue;
						yield {
							weights: {
								title,
								alternativeTitles: title,
								seriesName,
								subjects,
								description,
								guests: description * 0.75,
								publisherSearchTerms: description * 0.5,
								episodeSearchTerms: description * 0.5
							},
							phraseAnywhereTier
						};
					}
}

describe("SP-1.8 ranking harness", () => {
	it("measures D1 against Azure's top-10 and the title/AKA phrase-first gate", { timeout: 30 * 60_000 }, async () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		const { db, azureTop, docs } = await corpus();
		const base = await evaluate(db, azureTop, BASELINE);
		const tuned = await evaluate(db, azureTop, DEFAULT_RANKING);
		const lines = [
			"# SP-1.8 ranking harness report",
			"",
			`Corpus: ${docs.size} documents (Azure top 50 for ${allQueries().length} queries and for each word of the title/AKA queries, plus every film). Azure: ${URL_}.`,
			"",
			"| Ranking | top-10 overlap (free text + quoted) | title/AKA first |",
			"|---|---|---|",
			`| baseline (bm25, equal weights, no tiers) | ${base.overlap}/${base.maxOverlap} | ${base.titleFirst}/${base.titleCases} |`,
			`| DEFAULT_RANKING | ${tuned.overlap}/${tuned.maxOverlap} | ${tuned.titleFirst}/${tuned.titleCases} |`,
			"",
			"Title/AKA misses (DEFAULT_RANKING, top 3):",
			"",
			...(tuned.misses.length ? tuned.misses.map((m) => `- ${m}`) : ["- none"]),
			"",
			"Title/AKA misses (baseline, top 3):",
			"",
			...(base.misses.length ? base.misses.map((m) => `- ${m}`) : ["- none"]),
			""
		];
		if (process.env.SEARCH_RANKING_TUNE) {
			const results: { config: RankingConfig; score: Score }[] = [];
			for (const config of grid()) results.push({ config, score: await evaluate(db, azureTop, config) });
			results.sort((a, b) => b.score.titleFirst - a.score.titleFirst || b.score.overlap - a.score.overlap);
			lines.push("## Grid (weights in the ticket's order; best 15: title/AKA first, then overlap)", "", "| title=aka | series | subjects | description | phrase tier | overlap | title first |", "|---|---|---|---|---|---|---|");
			for (const { config, score } of results.slice(0, 15)) {
				const w = config.weights;
				lines.push(`| ${w.title} | ${w.seriesName} | ${w.subjects} | ${w.description} | ${config.phraseAnywhereTier} | ${score.overlap}/${score.maxOverlap} | ${score.titleFirst}/${score.titleCases} |`);
			}
			lines.push("");
		}
		const show = process.env.SEARCH_RANKING_SHOW;
		if (show) {
			const title = (id: string) => `${docs.get(id)?.title ?? id}`;
			lines.push(`## \`${show}\`: Azure top 10 vs D1 top 10 (DEFAULT_RANKING)`, "", "| # | Azure | D1 | D1 score |", "|---|---|---|---|");
			const mine = await d1Top(db, show, DEFAULT_RANKING);
			const az = azureTop[show] ?? (await azure({ search: show, top: 50 })).value.slice(0, 10).map((d) => d.id);
			for (let i = 0; i < 10; i++) lines.push(`| ${i + 1} | ${az[i] ? title(az[i]) : ""} | ${mine[i]?.title ?? ""} | ${mine[i]?.["@search.score"]?.toFixed?.(3) ?? ""} |`);
			lines.push("");
		}
		lines.push("## Per query (DEFAULT_RANKING vs baseline)", "", "| query | baseline | default |", "|---|---|---|");
		for (const q of Object.keys(tuned.perQuery)) lines.push(`| \`${q}\` | ${base.perQuery[q]} | ${tuned.perQuery[q]} |`);
		mkdirSync(OUT, { recursive: true });
		writeFileSync(resolve(OUT, "ranking-report.md"), lines.join("\n") + "\n");
		process.stdout.write(lines.join("\n") + "\n");
		expect(tuned.titleFirst).toBe(tuned.titleCases);
	});
});
