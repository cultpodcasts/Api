import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import searchWorker from "../workers/search/src/index";
import {
	DEFAULT_RANKING,
	isUnquoted,
	normalizedSql,
	normalizeTitle,
	rankingSql,
	TIER_SCORE_STEP,
	unwrapAzurePhraseBoost
} from "../workers/search/src/ranking";
import { boostUnquotedPhrase } from "../src/boostUnquotedPhrase";
import { d1, migratedSearchDb, upsertSearchDoc } from "./support/searchD1";

/** SP-1.8 (cultpodcasts/Api#225): bm25 column weights and unquoted exact title / AKA phrase-first ranking. */

/**
 * Documents built so plain bm25 puts the wrong one first: the competitors repeat the query's words
 * in short, heavily weighted fields, while the title/AKA match says them once.
 */
function corpus(): DatabaseSync {
	const db = migratedSearchDb();
	const doc = (id: string, fields: Record<string, unknown>) =>
		upsertSearchDoc(db, { description: null, release: "2026-01-01T00:00:00Z", ...fields, id });
	doc("faderhuset", {
		kind: "Film",
		title: "Faderhuset",
		alternative_titles: "Father's House\nThe House of the Holy Father",
		description: "A film about an evangelical congregation in Denmark and the people who left it, years later."
	});
	doc("potters-house", { title: "Potter's House", series_name: "House", description: "House house father house father." });
	doc("house-father", { title: "Father House Father House", series_name: "Father House" });
	doc("going-clear", {
		kind: "Film",
		title: "Going Clear",
		alternative_titles: "Going Clear: Scientology and the Prison of Belief",
		description: "Alex Gibney's documentary, from Lawrence Wright's book, about the church and its leaders over many decades."
	});
	doc("clear-going", { title: "Clear going clear going", series_name: "Going Clear Going Clear", description: "going clear going clear" });
	doc("source-family-episode", {
		title: "The Source Family and Father Yod",
		series_name: "Source Family",
		description: "source family source family source family"
	});
	doc("source-family-film", { kind: "Film", title: "The Source Family", description: "Documentary." });
	doc("phrase-in-description", { title: "Episode 12", description: "We talk about the house of the holy father tonight." });
	doc("hannah-w", { title: "Ask Hannah W. anything", description: "Hannah W. answers." });
	doc("hannah-and-w", { title: "Hannah meets W", description: "Hannah and W." });
	return db;
}

async function search(db: DatabaseSync, body: Record<string, unknown>) {
	const resp = await searchWorker.fetch(
		new Request("https://search.internal/indexes/cultpodcasts/docs/search", { method: "POST", body: JSON.stringify(body) }),
		{ SEARCH_DB: d1(db) }
	);
	expect(resp.status).toBe(200);
	return ((await resp.json()) as { value: { id: string; "@search.score": number }[] }).value;
}
const ids = async (db: DatabaseSync, q: string, extra: Record<string, unknown> = {}) => (await search(db, { search: q, ...extra })).map((d) => d.id);

describe("SP-1.8 ranking", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	describe("unquoted exact title / AKA ranks first (cutover gate)", () => {
		it.each([
			["the exact title", "Faderhuset", "faderhuset"],
			["an exact AKA (Father's House finds Faderhuset)", "Father's House", "faderhuset"],
			["an AKA without the apostrophe", "fathers house", "faderhuset"],
			["an AKA in another case", "FATHER'S HOUSE", "faderhuset"],
			["an exact title over a document repeating its words", "Going Clear", "going-clear"],
			["a long AKA with punctuation dropped", "going clear scientology and the prison of belief", "going-clear"],
			["a title whose first word is a stopword", "The Source Family", "source-family-film"]
		])("%s", async (_name, query, first) => {
			expect((await ids(corpus(), query))[0]).toBe(first);
		});

		it("needs the tiers: with them off (plain weighted bm25) a competitor wins", async () => {
			const db = corpus();
			const sql = `SELECT d.id FROM search_fts JOIN search_docs d ON d.rowid = search_fts.rowid WHERE search_fts MATCH ? ORDER BY bm25(search_fts), d.id LIMIT 1`;
			expect(db.prepare(sql).get('"father" OR "house"')).not.toEqual({ id: "faderhuset" });
		});

		it("then a title or AKA containing the phrase, then the phrase anywhere, then scattered terms", async () => {
			const order = await ids(corpus(), "house of the holy father");
			// Tier 0: none is exactly this. Tier 1: Faderhuset's AKA contains it. Tier 2: the phrase in a description.
			expect(order.slice(0, 2)).toEqual(["faderhuset", "phrase-in-description"]);
			expect(order).toContain("potters-house");
		});

		it("scores are tier-first and never increase down the page", async () => {
			const hits = await search(corpus(), { search: "Father's House" });
			expect(hits[0]["@search.score"]).toBeGreaterThan(3 * TIER_SCORE_STEP - 100);
			for (let i = 1; i < hits.length; i++) expect(hits[i]["@search.score"]).toBeLessThanOrEqual(hits[i - 1]["@search.score"]);
		});

		it("does not tier a single word that is only part of a title", async () => {
			// "house" is nobody's whole title: bm25 alone orders these, so the repeated-word documents lead.
			expect((await ids(corpus(), "house"))[0]).not.toBe("faderhuset");
		});

		it("does not reorder an explicit release sort", async () => {
			const db = corpus();
			upsertSearchDoc(db, { id: "newer", title: "House notes", release: "2026-06-01T00:00:00Z" });
			expect((await ids(db, "Father's House", { orderby: "release desc" }))[0]).toBe("newer");
		});
	});

	describe("quoted searches stay phrases", () => {
		it('"hannah w." matches the adjacent phrase only', async () => {
			expect(await ids(corpus(), '"hannah w."')).toEqual(["hannah-w"]);
		});

		it.each(['"Father\'s House"', "+father +house", "father | house", "father*", "-potter father house"])(
			"%s is not read as a title (no tiers)",
			(q) => {
				expect(isUnquoted(q)).toBe(false);
				expect(rankingSql(q).binds).toEqual([]);
			}
		);
	});

	describe("the api Worker's Azure phrase boost", () => {
		it("is unwrapped, so D1 ranks a boosted body exactly like the user's own text", async () => {
			const db = corpus();
			const boosted = boostUnquotedPhrase("Father's House");
			expect(boosted).not.toBe("Father's House");
			expect(unwrapAzurePhraseBoost(boosted, "full")).toBe("Father's House");
			expect(await ids(db, boosted, { queryType: "full" })).toEqual(await ids(db, "Father's House"));
		});

		it("leaves everything else alone", () => {
			expect(unwrapAzurePhraseBoost('"a b"^10 OR (a b)', "simple")).toBe('"a b"^10 OR (a b)');
			expect(unwrapAzurePhraseBoost("a b", "full")).toBe("a b");
			expect(unwrapAzurePhraseBoost(undefined, "full")).toBeUndefined();
			expect(unwrapAzurePhraseBoost(boostUnquotedPhrase('say "hi" now'), "full")).toBe(boostUnquotedPhrase('say "hi" now'));
		});
	});

	describe("title normalisation", () => {
		const samples = [
			"Father's House",
			"Going Clear: Scientology and the Prison of Belief",
			"  Spaced   out\ttitle  ",
			"Jonestown – Terror (1978)",
			"L. Ron Hubbard’s “secret”",
			"Été Pégase",
			"Line one\nLine  two "
		];

		it("SQL and TypeScript give the same form for every sample (the tiers compare them)", () => {
			const db = migratedSearchDb();
			for (const s of samples) {
				const row = db.prepare(`SELECT ${normalizedSql("?")} AS n`).get(s) as { n: string };
				expect(row.n, JSON.stringify(s)).toBe(normalizeTitle(s));
			}
		});

		it("folds ASCII case, drops apostrophes, turns punctuation into spaces and keeps one AKA per line", () => {
			expect(normalizeTitle("Father's House")).toBe("fathers house");
			expect(normalizeTitle("Going Clear: The Prison")).toBe("going clear the prison");
			expect(normalizeTitle("A\n B ")).toBe("a\nb");
		});
	});

	describe("weights", () => {
		it("follow the ticket's order: title = AKA > series name >= subjects >= description > guests > curator terms", () => {
			const w = DEFAULT_RANKING.weights;
			expect(w.title).toBe(w.alternativeTitles);
			expect(w.title).toBeGreaterThan(w.seriesName);
			expect(w.seriesName).toBeGreaterThanOrEqual(w.subjects);
			expect(w.subjects).toBeGreaterThanOrEqual(w.description);
			expect(w.description).toBeGreaterThan(w.guests);
			expect(w.guests).toBeGreaterThan(w.publisherSearchTerms);
			expect(w.publisherSearchTerms).toBe(w.episodeSearchTerms);
		});

		it("rejects a negative or non-finite weight", () => {
			expect(() => rankingSql("x", { ...DEFAULT_RANKING, weights: { ...DEFAULT_RANKING.weights, title: -1 } })).toThrow(/title/);
			expect(() => rankingSql("x", { ...DEFAULT_RANKING, weights: { ...DEFAULT_RANKING.weights, guests: NaN } })).toThrow(/guests/);
		});

		it("weight the title above the description for the same words", async () => {
			const db = migratedSearchDb();
			upsertSearchDoc(db, { id: "in-description", title: "Episode 1", description: "Synanon history", release: "2026-01-01T00:00:00Z" });
			upsertSearchDoc(db, { id: "in-title", title: "Synanon history", description: "Episode 1", release: "2026-01-01T00:00:00Z" });
			expect((await ids(db, "synanon"))[0]).toBe("in-title");
		});
	});

	it("keeps the page statement inside D1's 100 bound parameters with a ranked search", async () => {
		// A two-word unquoted search binds the MATCH, 5 ranking values, LIMIT and OFFSET: 92 left for the filter.
		const status = async (n: number) => {
			const filter = Array.from({ length: n }, (_, i) => `id eq 'x${i}'`).join(" or ");
			const resp = await searchWorker.fetch(
				new Request("https://search.internal/indexes/c/docs/search", { method: "POST", body: JSON.stringify({ search: "father house", filter }) }),
				{ SEARCH_DB: d1(corpus()) }
			);
			return { status: resp.status, body: (await resp.json()) as any };
		};
		expect((await status(92)).status).toBe(200);
		const over = await status(93);
		expect(over.status).toBe(400);
		expect(over.body.error.message).toMatch(/at most 92 comparisons/);
	});
});
