import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import searchWorker from "../workers/search/src/index";
import {
	LIVE_AZURE_RETRIEVABLE_KEYS,
	parseStringArray,
	splitLines,
	toAzureSearchDocument,
	toAzureSearchEnvelope,
	type AzureSearchDocRow
} from "../workers/search/src/azure-response";
import { parseRequest, SERVICE_UNAVAILABLE } from "../workers/search/src/docs-search";
import { SearchRequestError } from "../workers/search/src/errors";
import { parseFacet, parseODataFilter } from "../workers/search/src/odata";
import { MAX_OPERATOR_CHANGES, MAX_QUERY_ATOMS, toMatch } from "../workers/search/src/query";
import { d1, migratedSearchDb, upsertSearchDoc } from "./support/searchD1";

/** SP-1.9 (cultpodcasts/Api#269): the search-demo query engine, moved into workers/search. */

const expr = (q: string, mode: "any" | "all" = "any") => {
	const r = toMatch(q, mode);
	return r.kind === "match" ? r.expr : r.kind;
};

describe("toMatch: Azure simple syntax -> FTS5 MATCH", () => {
	it("ORs bare terms in searchMode any and ANDs them in all", () => {
		expect(expr("scientology cooper")).toBe('"scientology" OR "cooper"');
		expect(expr("scientology cooper", "all")).toBe('"scientology" AND "cooper"');
	});

	it("honours + (AND), | (OR) and - (NOT at a term boundary)", () => {
		expect(expr("scientology +cooper")).toBe('"scientology" AND "cooper"');
		expect(expr("scientology |cooper", "all")).toBe('"scientology" OR "cooper"');
		expect(expr("scientology -hubbard")).toBe('("scientology") NOT "hubbard"');
	});

	it("drops a leading or solitary negation (nothing to subtract from)", () => {
		expect(expr("-hubbard scientology")).toBe('"scientology"');
		expect(expr("-hubbard")).toBe("none");
	});

	it("keeps phrases (with stopwords) and prefixes", () => {
		expect(expr('"heaven\'s gate"')).toBe('"heaven\'s gate"');
		expect(expr('"the family"')).toBe('"the family"');
		expect(expr("scien*")).toBe('"scien" *');
		expect(expr('"paulette coo"*')).toBe('"paulette coo" *');
	});

	it("treats AND / OR / NOT as plain terms, then drops them as stopwords", () => {
		expect(expr('scientology AND "paulette cooper"')).toBe('"scientology" OR "paulette cooper"');
		expect(expr("cults NOT religion")).toBe('"cults" OR "religion"');
	});

	it("drops bare English stopwords; all-stopword text is 'none', empty text is 'browse'", () => {
		expect(expr("the cult of the lamb")).toBe('"cult" OR "lamb"');
		expect(expr("the and of")).toBe("none");
		expect(expr("")).toBe("browse");
		expect(expr("  ( )  ")).toBe("browse");
	});

	it("splits hyphenated and slashed terms like StandardTokenizer", () => {
		expect(expr("ex-mormon")).toBe('"ex" OR "mormon"');
		expect(expr("multi-level marketing")).toBe('"multi" OR "level" OR "marketing"');
		expect(expr("ac/dc")).toBe('"ac" OR "dc"');
	});

	it("expands possessives to the stripped form (EnglishPossessiveFilter)", () => {
		expect(expr("heaven's")).toBe('("heaven\'s" OR "heaven")');
		expect(expr("heaven’s")).toBe('("heaven’s" OR "heaven")');
	});

	it("keeps same-operator runs flat and parenthesises only where the operator changes", () => {
		expect(expr("a1 b2 +c3 +d4 e5")).toBe('(("a1" OR "b2") AND "c3" AND "d4") OR "e5"');
		expect(expr("a1 b2 -c3 d4")).toBe('("a1" OR "b2") NOT "c3" OR "d4"');
		expect(expr("a1 -b2 -c3", "all")).toBe('(("a1") NOT "b2") NOT "c3"');
		expect(expr("heaven's gate cult")).toBe('("heaven\'s" OR "heaven") OR "gate" OR "cult"');
	});

	it("does not nest deeper as the query gets longer", () => {
		const long = Array.from({ length: 256 }, (_, i) => `w${i}`).join(" ");
		const r = expr(long);
		expect(r).not.toContain("(");
		expect(r.split(" OR ")).toHaveLength(256);
	});

	it("throws SearchRequestError past the term and operator-change caps", () => {
		expect(MAX_QUERY_ATOMS).toBe(256);
		expect(() => toMatch(Array.from({ length: 257 }, (_, i) => `w${i}`).join(" "))).toThrow(SearchRequestError);
		const alternating = Array.from({ length: 40 }, (_, i) => `${i % 2 ? "+" : "|"}w${i}`).join(" ");
		expect(() => toMatch(alternating)).toThrow(/mixes operators/);
		const ok = Array.from({ length: MAX_OPERATOR_CHANGES + 1 }, (_, i) => `${i % 2 ? "+" : "|"}w${i}`).join(" ");
		expect(() => toMatch(ok)).not.toThrow();
	});

	it("quotes every atom so user text cannot inject FTS5 syntax", () => {
		expect(expr("NEAR(foo bar) col:baz")).toBe('"NEAR" OR "foo" OR "bar" OR "col:baz"');
		expect(expr('title:x" OR 1')).toBe('"title:x" OR " OR 1"');
		expect(expr('say "hi ""there"')).toBe('"say" OR "hi " OR "there"');
	});
});

describe("parseODataFilter: website OData subset -> SQL", () => {
	it("maps eq / ne / null onto search_docs columns", () => {
		expect(parseODataFilter("seriesName eq 'Cults'")).toEqual({ sql: "d.series_name = ?", binds: ["Cults"] });
		expect(parseODataFilter("podcastName eq 'Cults'")).toEqual({ sql: "d.series_name = ?", binds: ["Cults"] });
		expect(parseODataFilter("contentKind eq 'Film'")).toEqual({ sql: "d.kind = ?", binds: ["Film"] });
		expect(parseODataFilter("id ne 'abc'")).toEqual({ sql: "(d.id IS NULL OR d.id <> ?)", binds: ["abc"] });
		expect(parseODataFilter("lang eq null")).toEqual({ sql: "d.lang IS NULL", binds: [] });
		expect(parseODataFilter("lang ne null")).toEqual({ sql: "d.lang IS NOT NULL", binds: [] });
	});

	it("treats stored NULL lang as English", () => {
		expect(parseODataFilter("lang eq 'en'")).toEqual({ sql: "(d.lang IS NULL OR d.lang = 'en')", binds: [] });
		expect(parseODataFilter("search.in(lang, 'en,fr')")).toEqual({
			sql: "((d.lang IS NULL OR d.lang = 'en') OR d.lang IN (SELECT value FROM json_each(?)))",
			binds: ['["fr"]']
		});
	});

	it("parses search.in with a custom delimiter and OData quote doubling", () => {
		expect(parseODataFilter("search.in(seriesName, 'Heaven''s Gate£Cults', '£')")).toEqual({
			sql: "d.series_name IN (SELECT value FROM json_each(?))",
			binds: ['["Heaven\'s Gate","Cults"]']
		});
	});

	it("matches nothing for an empty search.in list", () => {
		expect(parseODataFilter("search.in(seriesName, '')").sql).toBe("0 = 1");
		expect(parseODataFilter("subjects/any(s: search.in(s, '', '£'))").sql).toContain("0 = 1");
	});

	it("parses subjects/any with eq and search.in", () => {
		expect(parseODataFilter("subjects/any(s: s eq 'Scientology')")).toEqual({
			sql: "EXISTS (SELECT 1 FROM doc_subjects s WHERE s.rowid_ref = d.rowid AND s.subject = ?)", // pragma: allowlist secret
			binds: ["Scientology"]
		});
		expect(parseODataFilter("subjects/any(x: search.in(x, 'A£B', '£'))")).toEqual({
			sql: "EXISTS (SELECT 1 FROM doc_subjects s WHERE s.rowid_ref = d.rowid AND s.subject IN (SELECT value FROM json_each(?)))", // pragma: allowlist secret
			binds: ['["A","B"]']
		});
	});

	it("binds a search.in list as one JSON parameter however long it is (D1: 100 binds max)", () => {
		const values = Array.from({ length: 500 }, (_, i) => `Series ${i}`);
		expect(parseODataFilter(`search.in(seriesName, '${values.join("£")}', '£')`).binds).toEqual([JSON.stringify(values)]);
		expect(parseODataFilter(`subjects/any(s: search.in(s, '${values.join("£")}', '£'))`).binds).toHaveLength(1);
	});

	it("accepts nesting up to 32 levels", () => {
		expect(parseODataFilter(`${"(".repeat(32)}id eq 'x'${")".repeat(32)}`).binds).toEqual(["x"]);
	});

	it("parses and / or with parentheses", () => {
		expect(parseODataFilter("(contentKind eq 'Film' or contentKind eq 'Episode') and lang eq 'fr'")).toEqual({
			sql: "(d.kind = ? OR d.kind = ?) AND d.lang = ?",
			binds: ["Film", "Episode", "fr"]
		});
	});

	it.each([
		["unknown field", "guests eq 'x'", /unknown field: guests/],
		["unsupported collection", "trailers/any(t: t eq 'x')", /unsupported collection/],
		["unterminated value", "seriesName eq 'x", /unterminated/],
		["trailing input", "seriesName eq 'x' zzz", /trailing input/],
		["missing operator", "seriesName 'x'", /expected eq\/ne/],
		["variable mismatch", "subjects/any(s: t eq 'x')", /variable mismatch/],
		["nesting past 32 levels", `${"(".repeat(33)}id eq 'x'${")".repeat(33)}`, /nested too deeply/],
		["a stack-overflowing run of (", "(".repeat(100000), /nested too deeply/]
	])("throws SearchRequestError on %s", (_label, filter, message) => {
		expect(() => parseODataFilter(filter)).toThrow(SearchRequestError);
		expect(() => parseODataFilter(filter)).toThrow(message);
	});
});

describe("parseFacet", () => {
	it("reads the field and count, capping count at 1000 and defaulting to 10", () => {
		expect(parseFacet("seriesName,count:1000,sort:count")).toEqual({ field: "seriesName", count: 1000 });
		expect(parseFacet("subjects,count:5000")).toEqual({ field: "subjects", count: 1000 });
		expect(parseFacet("lang")).toEqual({ field: "lang", count: 10 });
	});

	it("rejects other fields with SearchRequestError", () => {
		expect(() => parseFacet("description")).toThrow(SearchRequestError);
	});
});

describe("parseRequest", () => {
	it("accepts integer top / skip (numbers or integer strings) and clamps top to 1000 like Azure", () => {
		expect(parseRequest('{"top":"20","skip":"40"}')).toMatchObject({ top: 20, skip: 40 });
		expect(parseRequest('{"top":5000,"skip":100000}')).toMatchObject({ top: 1000, skip: 100000 });
		expect(parseRequest('{"top":0}')).toMatchObject({ top: 0 });
	});

	it.each([
		["not JSON", "{", /not valid JSON/],
		["an array", "[]", /JSON object/],
		["null", "null", /JSON object/],
		["a non-string filter", '{"filter":1}', /filter must be a string/],
		["non-array facets", '{"facets":"lang"}', /facets must be an array/],
		["an infinite skip", '{"skip":1e400}', /skip must be a non-negative integer/],
		["a fractional skip", '{"skip":1.5}', /skip must be a non-negative integer/],
		["a fractional top", '{"top":2.5}', /top must be a non-negative integer/],
		["a negative top", '{"top":-1}', /top must be a non-negative integer/],
		["a non-numeric top", '{"top":"ten"}', /top must be a non-negative integer/],
		["a skip past Azure's 100000", '{"skip":100001}', /skip must be at most 100000/],
		["an oversized search", JSON.stringify({ search: "a".repeat(8 * 1024 + 1) }), /search is too long/],
		["an oversized filter", JSON.stringify({ filter: "x".repeat(32 * 1024 + 1) }), /filter is too long/],
		["an oversized body", JSON.stringify({ queryType: "x".repeat(256 * 1024) }), /body is too large/]
	])("rejects a body that is %s", (_label, raw, message) => {
		expect(() => parseRequest(raw)).toThrow(SearchRequestError);
		expect(() => parseRequest(raw)).toThrow(message);
	});
});

const row = (over: Partial<AzureSearchDocRow> = {}): AzureSearchDocRow => ({
	rowid: 1,
	id: "e1",
	kind: "Film",
	title: "The Source Family",
	series_name: null,
	description: "Full description",
	release: "2026-10-01T10:00:00Z",
	duration: "01:38:00",
	spotify_id: null,
	apple_id: null,
	podcast_apple_id: null,
	youtube_id: "yt1",
	bbc: "",
	internet_archive: "",
	svc: "",
	image: null,
	trailers: '["00:02:10|https://www.youtube.com/watch?v=x|Trailer"]',
	alternative_titles: "Source Family\nLa famille Source\n",
	imdb_id: "tt2391950",
	tmdb_id: 157851,
	tvdb_id: null,
	series_imdb_id: null,
	series_tmdb_id: null,
	series_tvdb_id: null,
	lang: null,
	...over
});

describe("Azure document shape (SP-0.2) over the SP-1.1 columns", () => {
	it("returns exactly the live Azure retrievable keys, in Azure order, after @search.score", () => {
		const doc = toAzureSearchDocument(row(), 2.5, ["Cults"]);
		expect(LIVE_AZURE_RETRIEVABLE_KEYS).toHaveLength(25);
		expect(Object.keys(doc)).toEqual(["@search.score", ...LIVE_AZURE_RETRIEVABLE_KEYS]);
		for (const hidden of ["podcastName", "guests", "publisherSearchTerms", "episodeSearchTerms"]) {
			expect(doc).not.toHaveProperty(hidden);
		}
	});

	it("maps identity ids, AKAs and trailers from their columns", () => {
		expect(toAzureSearchDocument(row(), 1, [])).toMatchObject({
			release: "2026-10-01T10:00:00Z",
			alternativeTitles: ["Source Family", "La famille Source"],
			trailers: ["00:02:10|https://www.youtube.com/watch?v=x|Trailer"],
			imdbId: "tt2391950",
			tmdbId: 157851,
			tvdbId: null
		});
	});

	it("returns unset collections as null, like Azure", () => {
		expect(splitLines(null)).toBeNull();
		expect(splitLines("\n \n")).toBeNull();
		expect(parseStringArray(null)).toBeNull();
		expect(parseStringArray("[]")).toBeNull();
		expect(parseStringArray("not json")).toBeNull();
		expect(parseStringArray("[1]")).toBeNull();
	});

	it("keeps @odata.context null and adds count / facets only when asked", () => {
		expect(toAzureSearchEnvelope([])).toEqual({ "@odata.context": null, value: [] });
		expect(toAzureSearchEnvelope([], { count: 3, facets: { lang: [] } })).toEqual({
			"@odata.context": null,
			value: [],
			"@odata.count": 3,
			"@search.facets": { lang: [] }
		});
	});
});

// A description longer than Azure's ~100-char index cap, with a term only past the cap.
const LONG_DESCRIPTION = `${"Former members describe life inside the group. ".repeat(4)}Later episodes cover the Xenu tapes.`;

function seed(db: DatabaseSync) {
	upsertSearchDoc(
		db,
		{
			id: "ep-scn-1",
			title: "Inside Scientology",
			series_name: "Cult Stories",
			description: LONG_DESCRIPTION,
			guests: "Leah Remini",
			release: "2026-11-03T08:00:00Z",
			duration: "00:52:00",
			spotify_id: "sp1",
			publisher_search_terms: "hiddenpublisherterm",
			episode_search_terms: "hiddenepisodeterm"
		},
		["Scientology", "Religion"]
	);
	upsertSearchDoc(
		db,
		{
			id: "ep-scn-2",
			title: "Scientology and Paulette Cooper",
			series_name: "Cult Stories",
			description: "The Paulette Cooper story.",
			release: "2026-10-01T08:00:00Z",
			lang: "fr"
		},
		["Scientology"]
	);
	upsertSearchDoc(
		db,
		{
			id: "film-1",
			kind: "Film",
			title: "The Source Family",
			alternative_titles: "Die Source Familie",
			description: "Documentary about Father Yod.",
			release: "2013-05-03T00:00:00Z",
			duration: "01:38:00",
			imdb_id: "tt2391950",
			tmdb_id: 157851,
			trailers: '["00:02:10|https://www.youtube.com/watch?v=x|Trailer"]'
		},
		["The Source Family"]
	);
	upsertSearchDoc(
		db,
		{ id: "news-1", kind: "NewsReport", title: "Cult news roundup", series_name: "News 12", release: "2026-11-10T00:00:00Z" },
		["Religion"]
	);
}

async function post(body: unknown, env = { SEARCH_DB: seeded() }, index = "cultpodcasts") {
	const resp = await searchWorker.fetch(
		new Request(`https://search.internal/indexes/${index}/docs/search?api-version=2024-07-01`, {
			method: "POST",
			headers: { "content-type": "application/json", "api-key": "ignored" },
			body: typeof body === "string" ? body : JSON.stringify(body)
		}),
		env
	);
	return { status: resp.status, headers: resp.headers, body: (await resp.json()) as any };
}

function seeded(): D1Database {
	const db = migratedSearchDb();
	seed(db);
	return d1(db);
}

const ids = (body: any) => (body.value as { id: string }[]).map((d) => d.id);

describe("POST /indexes/{index}/docs/search against the SP-1.1 schema", () => {
	it("searches full descriptions beyond Azure's index cap (SP-0.3 option A)", async () => {
		const { status, body } = await post({ search: "xenu", count: true });
		expect(status).toBe(200);
		expect(ids(body)).toEqual(["ep-scn-1"]);
		expect(body["@odata.count"]).toBe(1);
		expect(body.value[0].description).toBe(LONG_DESCRIPTION);
	});

	it("searches guests but never returns them", async () => {
		const { body } = await post({ search: "remini" });
		expect(ids(body)).toEqual(["ep-scn-1"]);
		expect(body.value[0]).not.toHaveProperty("guests");
	});

	it("searches hidden curator terms but never returns them", async () => {
		expect(ids((await post({ search: "hiddenpublisherterm" })).body)).toEqual(["ep-scn-1"]);
		const { body } = await post({ search: "hiddenepisodeterm" });
		expect(ids(body)).toEqual(["ep-scn-1"]);
		expect(body.value[0]).not.toHaveProperty("publisherSearchTerms");
		expect(body.value[0]).not.toHaveProperty("episodeSearchTerms");
	});

	it("searches film AKAs and returns them with identity ids and trailers", async () => {
		const { body } = await post({ search: "familie" });
		expect(ids(body)).toEqual(["film-1"]);
		expect(body.value[0]).toMatchObject({
			contentKind: "Film",
			alternativeTitles: ["Die Source Familie"],
			imdbId: "tt2391950",
			tmdbId: 157851,
			trailers: ["00:02:10|https://www.youtube.com/watch?v=x|Trailer"],
			subjects: ["The Source Family"]
		});
		expect(Object.keys(body.value[0])).toEqual(["@search.score", ...LIVE_AZURE_RETRIEVABLE_KEYS]);
	});

	it("returns the Azure envelope: @odata.context null, count only when asked, positive scores", async () => {
		const { headers, body } = await post({ search: "scientology" });
		expect(headers.get("cache-control")).toBe("no-store");
		expect(body["@odata.context"]).toBeNull();
		expect(body).not.toHaveProperty("@odata.count");
		expect(body.value.length).toBe(2);
		for (const d of body.value) expect(d["@search.score"]).toBeGreaterThan(0);
	});

	it("applies searchMode all", async () => {
		expect(ids((await post({ search: "scientology paulette", searchMode: "all" })).body)).toEqual(["ep-scn-2"]);
		expect(ids((await post({ search: "scientology paulette", searchMode: "any" })).body).sort()).toEqual([
			"ep-scn-1",
			"ep-scn-2"
		]);
	});

	it("keeps an OR filter inside the MATCH (filter is parenthesised)", async () => {
		const { body } = await post({
			search: "paulette",
			filter: "contentKind eq 'Film' or contentKind eq 'Episode'"
		});
		expect(ids(body)).toEqual(["ep-scn-2"]);
	});

	it("filters by subject, series and lang (NULL = English)", async () => {
		expect(ids((await post({ filter: "subjects/any(s: s eq 'Religion')" })).body)).toEqual(["news-1", "ep-scn-1"]);
		expect(ids((await post({ filter: "seriesName eq 'Cult Stories'", orderby: "release asc" })).body)).toEqual([
			"ep-scn-2",
			"ep-scn-1"
		]);
		expect(ids((await post({ search: "scientology", filter: "lang eq 'en'" })).body)).toEqual(["ep-scn-1"]);
		expect(ids((await post({ filter: "id eq 'film-1'" })).body)).toEqual(["film-1"]);
		expect(ids((await post({ search: "scientology", filter: "id ne 'ep-scn-1'" })).body)).toEqual(["ep-scn-2"]);
	});

	it("browses by release desc with top / skip / count", async () => {
		const all = await post({ count: true });
		expect(ids(all.body)).toEqual(["news-1", "ep-scn-1", "ep-scn-2", "film-1"]);
		expect(all.body["@odata.count"]).toBe(4);
		const page = await post({ top: 2, skip: 1, count: true });
		expect(ids(page.body)).toEqual(["ep-scn-1", "ep-scn-2"]);
		expect(page.body["@odata.count"]).toBe(4);
	});

	it("returns facets as Azure value/count buckets", async () => {
		const { body } = await post({
			facets: ["subjects,count:2", "contentKind", "lang", "seriesName,count:1000,sort:count"]
		});
		expect(body["@search.facets"].subjects).toEqual([
			{ value: expect.any(String), count: 2 },
			{ value: expect.any(String), count: 2 }
		]);
		expect(body["@search.facets"].contentKind).toEqual(
			expect.arrayContaining([
				{ value: "Episode", count: 2 },
				{ value: "Film", count: 1 },
				{ value: "NewsReport", count: 1 }
			])
		);
		expect(body["@search.facets"].lang).toEqual([
			{ value: "en", count: 3 },
			{ value: "fr", count: 1 }
		]);
		expect(body["@search.facets"].seriesName[0]).toEqual({ value: "Cult Stories", count: 2 });
	});

	it("projects select to the named fields plus @search.score", async () => {
		const { body } = await post({ search: "familie", select: "id, title" });
		expect(body.value).toEqual([{ "@search.score": expect.any(Number), id: "film-1", title: "The Source Family" }]);
	});

	it("returns nothing for an all-stopword query instead of browsing", async () => {
		const { body } = await post({ search: "the and of", count: true });
		expect(body.value).toEqual([]);
		expect(body["@odata.count"]).toBe(0);
	});

	it("runs a 256-term pasted query in FTS5 (no parser stack overflow) and 400s past the cap", async () => {
		const words = Array.from({ length: 256 }, (_, i) => `word${i}`);
		expect((await post({ search: words.join(" ") })).status).toBe(200);
		const withHit = [...words.slice(0, 255), "scientology"].join(" ");
		const hit = await post({ search: withHit });
		expect(hit.status).toBe(200);
		expect(hit.body.value.length).toBe(2);
		const over = await post({ search: [...words, "extra"].join(" ") });
		expect(over.status).toBe(400);
		expect(over.body.error.message).toMatch(/too many terms/);
	});

	it("runs a 256-term possessive query (512 FTS atoms) without overflowing", async () => {
		const words = Array.from({ length: 256 }, (_, i) => `word${i}'s`).join(" ");
		expect((await post({ search: words })).status).toBe(200);
	});

	it("runs FTS5-looking user text as plain terms (no MATCH syntax error, so no 400/503)", async () => {
		const { status } = await post({ search: 'NEAR(foo bar) col:baz title:x" OR 1 ^2 {a b}' });
		expect(status).toBe(200);
	});

	describe("D1's 100-bound-parameter limit", () => {
		function bigDb(n: number) {
			const db = migratedSearchDb();
			for (let i = 0; i < n; i++) {
				upsertSearchDoc(
					db,
					{
						id: `bulk-${String(i).padStart(4, "0")}`,
						title: `Bulk episode ${i}`,
						series_name: `Series ${i % 150}`,
						release: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`
					},
					[`Subject ${i % 150}`]
				);
			}
			return db;
		}

		it("the test adapter rejects more than 100 binds, like D1", () => {
			const stmt = d1(migratedSearchDb()).prepare("SELECT 1");
			expect(() => stmt.bind(...Array(100).fill(1))).not.toThrow();
			expect(() => stmt.bind(...Array(101).fill(1))).toThrow(/too many SQL variables/);
		});

		it("returns a top: 1000 page with more than 100 hits, subjects included", async () => {
			const { status, body } = await post({ search: "bulk", top: 1000, count: true }, { SEARCH_DB: d1(bigDb(250)) });
			expect(status).toBe(200);
			expect(body.value).toHaveLength(250);
			expect(body["@odata.count"]).toBe(250);
			for (const d of body.value) expect(d.subjects).toHaveLength(1);
		});

		it("runs a 150-value search.in through the page, count and facet statements", async () => {
			const series = Array.from({ length: 150 }, (_, i) => `Series ${i}`).join("£");
			const subjects = Array.from({ length: 150 }, (_, i) => `Subject ${i}`).join("£");
			const { status, body } = await post(
				{
					filter: `search.in(seriesName, '${series}', '£') and subjects/any(s: search.in(s, '${subjects}', '£'))`,
					top: 1000,
					count: true,
					facets: ["seriesName,count:1000", "subjects,count:1000", "contentKind", "lang"]
				},
				{ SEARCH_DB: d1(bigDb(300)) }
			);
			expect(status).toBe(200);
			expect(body.value).toHaveLength(300);
			expect(body["@odata.count"]).toBe(300);
			expect(body["@search.facets"].seriesName).toHaveLength(150);
			expect(body["@search.facets"].subjects).toHaveLength(150);
		});

		it("returns 400 (not a D1 503) for a filter with more separate comparisons than D1 can bind", async () => {
			const filter = Array.from({ length: 99 }, (_, i) => `id eq 'x${i}'`).join(" or ");
			const resp = await post({ filter });
			expect(resp.status).toBe(400);
			expect(resp.body.error.message).toMatch(/too many values/);
			const ok = await post({ filter: Array.from({ length: 98 }, (_, i) => `id eq 'x${i}'`).join(" or ") });
			expect(ok.status).toBe(200);
		});
	});

	it("accepts any index name, so the harness's /indexes/d1/… path works", async () => {
		expect((await post({ search: "familie" }, undefined, "d1")).status).toBe(200);
	});

	it.each([
		["a bad filter", { filter: "seriesName eq" }],
		["an unknown filter field", { filter: "guests eq 'x'" }],
		["an unsupported facet", { facets: ["description"] }],
		["invalid JSON", "{"],
		["a non-integer skip", { skip: 1.5 }],
		["an infinite skip", '{"skip":1e400}'],
		["a fractional top", { top: 2.5 }],
		["a skip past 100000", { skip: 100001 }],
		["deep filter nesting", { filter: "(".repeat(5000) }],
		["an oversized search", { search: "word ".repeat(2000) }],
		["an oversized filter", { filter: `id eq '${"x".repeat(40000)}'` }]
	])("returns 400 with an Azure-like error for %s", async (_label, body) => {
		const resp = await post(body);
		expect(resp.status).toBe(400);
		expect(resp.body).toEqual({ error: { code: "", message: expect.any(String) } });
	});

	it("returns a generic 503 (retryable, never 400) when D1 fails, logging the detail", async () => {
		const failing = {
			prepare() {
				return {
					bind() {
						return this;
					}
				};
			},
			async batch() {
				throw new Error("D1_ERROR: D1 DB is overloaded. Too many requests queued. " + "x".repeat(1000));
			}
		} as unknown as D1Database;
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const resp = await post({ search: "scientology" }, { SEARCH_DB: failing });
			expect(resp.status).toBe(503);
			expect(resp.body).toEqual(SERVICE_UNAVAILABLE);
			expect(resp.body).toEqual({ error: { code: "ServiceUnavailable", message: "Search is temporarily unavailable." } });
			expect(JSON.stringify(resp.body)).not.toMatch(/D1_ERROR|overloaded/);
			expect(logged).toHaveBeenCalledWith("search: D1 failure", {
				message: expect.stringMatching(/^D1_ERROR: D1 DB is overloaded/),
				name: "Error"
			});
			expect((logged.mock.calls[0][1] as { message: string }).message).toHaveLength(500);
		} finally {
			logged.mockRestore();
		}
	});

	it("returns the generic 503 without SQL or schema names when the schema is missing", async () => {
		const { DatabaseSync } = await import("node:sqlite");
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const resp = await post({ search: "x" }, { SEARCH_DB: d1(new DatabaseSync(":memory:")) });
			expect(resp.status).toBe(503);
			expect(resp.body).toEqual(SERVICE_UNAVAILABLE);
			expect(JSON.stringify(resp.body)).not.toMatch(/search_docs|search_fts|SELECT/);
			expect(logged).toHaveBeenCalledWith("search: D1 failure", expect.objectContaining({ message: expect.stringMatching(/no such table/) }));
		} finally {
			logged.mockRestore();
		}
	});

	it("never writes: the search route leaves the database unchanged", async () => {
		const db = migratedSearchDb();
		seed(db);
		const before = db.prepare("SELECT count(*) AS n, total_changes() AS c FROM search_docs").get();
		await post({ search: "scientology", facets: ["lang"], count: true }, { SEARCH_DB: d1(db) });
		expect(db.prepare("SELECT count(*) AS n, total_changes() AS c FROM search_docs").get()).toEqual(before);
	});
});
