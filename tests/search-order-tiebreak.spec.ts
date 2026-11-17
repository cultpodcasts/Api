import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import searchWorker from "../workers/search/src/index";
import { orderBy } from "../workers/search/src/docs-search";
import { rankingSql, TIER_SCORE_STEP } from "../workers/search/src/ranking";
import { d1, migratedSearchDb, upsertSearchDoc } from "./support/searchD1";

/** SP-1.7 (cultpodcasts/Api#224): deterministic secondary sort by id on release and rank pages. */

const SAME_SECOND = "2026-11-05T12:00:00Z";
// Inserted out of id order, so rowid order (what SQLite returns ties in by default) is not id order.
const TIED = ["m", "c", "x", "a", "q", "f"];

function fixture() {
	const db = migratedSearchDb();
	for (const id of TIED) {
		upsertSearchDoc(db, { id, title: "Cult tapes", description: "same words", release: SAME_SECOND }, ["Tied"]);
	}
	upsertSearchDoc(db, { id: "newest", title: "Cult tapes", description: "same words", release: "2026-11-06T00:00:00Z" }, ["Tied"]);
	upsertSearchDoc(db, { id: "oldest", title: "Cult tapes", description: "same words", release: "2026-11-04T00:00:00Z" }, ["Tied"]);
	return { db, env: { SEARCH_DB: d1(db) } };
}

async function page(env: { SEARCH_DB: D1Database }, body: Record<string, unknown>): Promise<string[]> {
	const resp = await searchWorker.fetch(
		new Request("https://search.internal/indexes/cultpodcasts/docs/search", { method: "POST", body: JSON.stringify(body) }),
		env
	);
	return ((await resp.json()) as { value: { id: string }[] }).value.map((d) => d.id);
}

/** Every page of `size`, concatenated: what a client paging with skip sees. */
async function allPages(env: { SEARCH_DB: D1Database }, body: Record<string, unknown>, size: number) {
	const out: string[] = [];
	for (let skip = 0; ; skip += size) {
		const ids = await page(env, { ...body, top: size, skip });
		if (!ids.length) return out;
		out.push(...ids);
	}
}

const sorted = [...TIED].sort();

describe("deterministic secondary sort by id (SP-1.7)", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	it("release desc: newest first, a same-second group by id ascending", async () => {
		const { env } = fixture();
		expect(await page(env, { orderby: "release desc" })).toEqual(["newest", ...sorted, "oldest"]);
	});

	it("orders ties by id on the paths that sort instead of reading the index: subject pages and searches sorted by release", async () => {
		const { env } = fixture();
		const newestFirst = ["newest", ...sorted, "oldest"];
		expect(await page(env, { filter: "subjects/any(s: s eq 'Tied')" })).toEqual(newestFirst);
		expect(await page(env, { search: "cult", orderby: "release desc" })).toEqual(newestFirst);
		expect(await page(env, { search: "cult", orderby: "release asc" })).toEqual([...newestFirst].reverse());
	});

	it("browsing (no search text, no orderby) is the same order as release desc", async () => {
		const { env } = fixture();
		const filter = "subjects/any(s: s eq 'Tied')";
		expect(await page(env, { filter })).toEqual(await page(env, { filter, orderby: "release desc" }));
	});

	it("release asc is exactly release desc reversed (ties by id descending)", async () => {
		const { env } = fixture();
		const desc = await page(env, { orderby: "release desc" });
		expect(await page(env, { orderby: "release asc" })).toEqual([...desc].reverse());
	});

	it("relevance: equal bm25 scores come back by id ascending", async () => {
		const { env } = fixture();
		// Identical text, so identical scores: only the tie-break orders them.
		expect(await page(env, { search: "cult tapes" })).toEqual(["a", "c", "f", "m", "newest", "oldest", "q", "x"]);
	});

	it.each([
		["release desc", { orderby: "release desc" }],
		["release asc", { orderby: "release asc" }],
		["a subject page", { filter: "subjects/any(s: s eq 'Tied')" }],
		["relevance", { search: "cult" }]
	])("paging %s with skip never repeats or drops a tied row, and every page size agrees", async (_name, body) => {
		const { env } = fixture();
		const whole = await page(env, body);
		expect(new Set(whole).size).toBe(8);
		for (const size of [1, 2, 3, 5]) expect(await allPages(env, body, size)).toEqual(whole);
	});

	it("serves the newest-first browse page straight from idx_search_docs_release, with no sort step", () => {
		const { db } = fixture();
		for (const order of [orderBy(undefined, null), orderBy("release asc", null)]) {
			const plan = (db.prepare(`EXPLAIN QUERY PLAN SELECT d.id FROM search_docs d ${order} LIMIT 10`).all() as { detail: string }[])
				.map((r) => r.detail)
				.join("\n");
			expect(plan).toMatch(/idx_search_docs_release/);
			expect(plan).not.toMatch(/TEMP B-TREE/);
		}
	});

	it("facets: buckets tied on count come back by value, so a count: cut inside a tie is stable", async () => {
		const db = migratedSearchDb();
		// Inserted out of value order: four series and four subjects, each on exactly one doc.
		for (const [i, name] of ["Delta", "Bravo", "Charlie", "Alpha"].entries()) {
			upsertSearchDoc(db, { id: `f${i}`, title: "Facet tie", series_name: name }, [name]);
		}
		const resp = await searchWorker.fetch(
			new Request("https://search.internal/indexes/cultpodcasts/docs/search", {
				method: "POST",
				body: JSON.stringify({ facets: ["seriesName,count:2", "subjects,count:3"] })
			}),
			{ SEARCH_DB: d1(db) }
		);
		const facets = ((await resp.json()) as { "@search.facets": Record<string, { value: string; count: number }[]> })[
			"@search.facets"
		];
		expect(facets.seriesName).toEqual([
			{ value: "Alpha", count: 1 },
			{ value: "Bravo", count: 1 }
		]);
		expect(facets.subjects.map((b) => b.value)).toEqual(["Alpha", "Bravo", "Charlie"]);
	});

	it("orderBy: every order ends in id, and an unknown orderby falls back to relevance or newest first", () => {
		const relevance = rankingSql("cult tapes").order;
		expect(orderBy("release desc", relevance)).toBe("ORDER BY d.release DESC, d.id ASC");
		expect(orderBy(" Release ASC ", relevance)).toBe("ORDER BY d.release ASC, d.id DESC");
		expect(orderBy(undefined, relevance)).toBe("ORDER BY tier, bm, d.id ASC");
		expect(orderBy("title asc", relevance)).toBe("ORDER BY tier, bm, d.id ASC");
		expect(orderBy("title asc", null)).toBe("ORDER BY d.release DESC, d.id ASC");
	});

	it.each(["cult", "cult tapes", '"cult tapes"', "cult -tapes", "tapes*", "cult | tapes"])(
		"the SP-1.8 relevance order for %s keeps id as the last key, after the tier and bm25",
		(q) => {
			expect(rankingSql(q).order).toBe("ORDER BY tier, bm, d.id ASC");
		}
	);

	it.each([
		["tier 0 (exact title)", "cult tapes", "Cult tapes", "the cult tapes", 0],
		["tier 1 (title contains the phrase)", "cult tapes", "The cult tapes vol", "the cult tapes", 1],
		["tier 2 (phrase only in the description)", "cult tapes", "Episode", "the cult tapes", 2],
		["tier 3 (scattered words)", "cult tapes", "Episode", "tapes of a cult", 3],
		["a quoted phrase (not tiered, so tier 3)", '"cult tapes"', "Cult tapes", "the cult tapes", 3],
		["a single word (tier 0: exact title)", "cult", "Cult", "the cult tapes", 0]
	] as const)("ranked ties inside %s come back by id ascending, on every page size", async (_name, search, title, description, tier) => {
		const db = migratedSearchDb();
		for (const id of TIED) upsertSearchDoc(db, { id, title, description, release: SAME_SECOND });
		const env = { SEARCH_DB: d1(db) };
		const resp = await searchWorker.fetch(
			new Request("https://search.internal/indexes/cultpodcasts/docs/search", { method: "POST", body: JSON.stringify({ search }) }),
			env
		);
		const hits = ((await resp.json()) as { value: { id: string; "@search.score": number }[] }).value;
		// @search.score is (3 - tier) * TIER_SCORE_STEP - bm25, so the tier is its thousands band.
		expect(hits.map((h) => 3 - Math.floor(h["@search.score"] / TIER_SCORE_STEP))).toEqual(TIED.map(() => tier));
		const whole = hits.map((h) => h.id);
		expect(whole).toEqual(sorted);
		for (const size of [1, 2, 4]) expect(await allPages(env, { search }, size)).toEqual(whole);
	});
});
