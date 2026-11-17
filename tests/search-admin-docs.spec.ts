import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import searchWorker from "../workers/search/src/index";
import {
	ADMIN_WRITE_LOG,
	MAX_DELETES,
	MAX_DOC_BYTES,
	MAX_UPSERTS,
	parseAdminDocsRequest,
	toDocRow,
	type SearchDocUpsert
} from "../workers/search/src/admin-docs";
import { searchIndexDocSchema } from "../src/openapiSchemas";
import type { SearchEnv } from "../workers/search/src/env";
import { SERVICE_UNAVAILABLE } from "../workers/search/src/errors";
import { d1, d1Spy, migratedSearchDb } from "./support/searchD1";

/** SP-1.4 (cultpodcasts/Api#222): the search Worker's admin upsert/delete route. */

const T0 = Date.UTC(2026, 10, 1);

function doc(id: string, overrides: Partial<SearchDocUpsert> = {}): SearchDocUpsert {
	return {
		id,
		contentKind: "Episode",
		title: `Title ${id}`,
		seriesName: "Series",
		description: "A description",
		release: "2026-11-01T10:00:00Z",
		duration: "00:45:00",
		subjects: ["Scientology"],
		modifiedAt: T0,
		...overrides
	};
}

type Fixture = { db: DatabaseSync; env: SearchEnv };

function fixture(): Fixture {
	const db = migratedSearchDb();
	return { db, env: { SEARCH_DB: d1(db), searchEnvironment: "preview" } };
}

async function write(env: SearchEnv, body: unknown, method = "POST") {
	const resp = await searchWorker.fetch(
		new Request("https://search.internal/admin/docs", {
			method,
			body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
		}),
		env
	);
	return { status: resp.status, body: (await resp.json()) as any };
}

async function search(env: SearchEnv, body: Record<string, unknown>) {
	const resp = await searchWorker.fetch(
		new Request("https://search.internal/indexes/cultpodcasts/docs/search", { method: "POST", body: JSON.stringify(body) }),
		env
	);
	return (await resp.json()) as any;
}

const ids = async (env: SearchEnv, text: string) => (await search(env, { search: text })).value.map((d: any) => d.id);

const row = (db: DatabaseSync, id: string) => db.prepare("SELECT * FROM search_docs WHERE id = ?").get(id) as any;
const subjects = (db: DatabaseSync, id: string) =>
	(
		db
			.prepare("SELECT s.subject FROM doc_subjects s JOIN search_docs d ON d.rowid = s.rowid_ref WHERE d.id = ? ORDER BY 1")
			.all(id) as { subject: string }[]
	).map((r) => r.subject);
/** Content-aware FTS5 integrity check: throws when search_fts and search_docs differ. */
const ftsIntact = (db: DatabaseSync) => db.exec("INSERT INTO search_fts(search_fts, rank) VALUES ('integrity-check', 1)");

describe("search Worker POST /admin/docs (SP-1.4)", () => {
	let logs: MockInstance;
	beforeEach(() => {
		logs = vi.spyOn(console, "log").mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	it("inserts documents that the next search finds, with subjects, AKAs and guests indexed", async () => {
		const { db, env } = fixture();
		const resp = await write(env, {
			upserts: [
				doc("film-1", {
					contentKind: "Film",
					title: "Faderhuset",
					alternativeTitles: ["Father's House"],
					guests: ["Hannah Whitfield"],
					subjects: ["Cults", "Cults", " "],
					tmdbId: 123
				}),
				doc("ep-1")
			]
		});
		expect(resp).toEqual({ status: 200, body: { upserted: 2, deleted: 0, stale: [], notFound: [] } });
		expect(await ids(env, "faderhuset")).toEqual(["film-1"]);
		expect(await ids(env, "\"father's house\"")).toEqual(["film-1"]);
		expect(await ids(env, "whitfield")).toEqual(["film-1"]);
		const hit = (await search(env, { search: "faderhuset" })).value[0];
		expect(hit).toMatchObject({ contentKind: "Film", alternativeTitles: ["Father's House"], subjects: ["Cults"], tmdbId: 123 });
		expect(hit).not.toHaveProperty("guests");
		expect(subjects(db, "film-1")).toEqual(["Cults"]);
		ftsIntact(db);
		expect(logs).toHaveBeenCalledWith(ADMIN_WRITE_LOG, {
			environment: "preview",
			upserted: 2,
			deleted: 0,
			stale: 0,
			notFound: 0
		});
	});

	it("updates a document with a newer modifiedAt: old terms leave the index, subjects are replaced", async () => {
		const { db, env } = fixture();
		await write(env, { upserts: [doc("ep-1", { title: "Xenu lecture", subjects: ["Scientology", "Hubbard"] })] });
		const rowid = row(db, "ep-1").rowid;
		const resp = await write(env, { upserts: [doc("ep-1", { title: "Thetan audit", subjects: ["Auditing"], modifiedAt: T0 + 1 })] });
		expect(resp.body).toEqual({ upserted: 1, deleted: 0, stale: [], notFound: [] });
		expect(await ids(env, "xenu")).toEqual([]);
		expect(await ids(env, "thetan")).toEqual(["ep-1"]);
		expect(row(db, "ep-1")).toMatchObject({ rowid, modified_at: T0 + 1 });
		expect(subjects(db, "ep-1")).toEqual(["Auditing"]);
		ftsIntact(db);
	});

	it("drops a stale replay (older modifiedAt) and leaves the stored document and its subjects alone", async () => {
		const { db, env } = fixture();
		await write(env, { upserts: [doc("ep-1", { title: "New title", subjects: ["New"], modifiedAt: T0 + 10 })] });
		const resp = await write(env, {
			upserts: [doc("ep-1", { title: "Old title", subjects: ["Old"], modifiedAt: T0 }), doc("ep-2")]
		});
		expect(resp.body).toEqual({ upserted: 1, deleted: 0, stale: ["ep-1"], notFound: [] });
		expect(row(db, "ep-1")).toMatchObject({ title: "New title", modified_at: T0 + 10 });
		expect(subjects(db, "ep-1")).toEqual(["New"]);
		expect(await ids(env, "old")).toEqual([]);
		ftsIntact(db);
	});

	it("applies an equal modifiedAt (an idempotent replay)", async () => {
		const { db, env } = fixture();
		await write(env, { upserts: [doc("ep-1", { title: "First" })] });
		const resp = await write(env, { upserts: [doc("ep-1", { title: "Second" })] });
		expect(resp.body.upserted).toBe(1);
		expect(row(db, "ep-1").title).toBe("Second");
		ftsIntact(db);
	});

	it("deletes by id: the row, its subjects and its FTS terms go; unknown ids are reported, not errors", async () => {
		const { db, env } = fixture();
		await write(env, { upserts: [doc("ep-1", { title: "Xenu" }), doc("ep-2")] });
		const resp = await write(env, { deletes: ["ep-1", "missing"] });
		expect(resp.body).toEqual({ upserted: 0, deleted: 1, stale: [], notFound: ["missing"] });
		expect(row(db, "ep-1")).toBeUndefined();
		expect(db.prepare("SELECT COUNT(*) AS n FROM doc_subjects").get()).toEqual({ n: 1 });
		expect(await ids(env, "xenu")).toEqual([]);
		ftsIntact(db);
	});

	it("stores the Azure shapes: UTC release without milliseconds, Episode when contentKind is absent, '' for missing service keys", async () => {
		const { db, env } = fixture();
		const { contentKind: _, ...noKind } = doc("ep-1", { release: "2026-11-01T11:30:00.123+01:00", trailers: ["0:02:00|https://y/t|Trailer"] });
		await write(env, { upserts: [noKind] });
		expect(row(db, "ep-1")).toMatchObject({
			kind: "Episode",
			release: "2026-11-01T10:30:00Z",
			bbc: "",
			internet_archive: "",
			svc: "",
			trailers: JSON.stringify(["0:02:00|https://y/t|Trailer"])
		});
	});

	it("keeps one item per line in list columns, even when an item contains a newline", async () => {
		const { db, env } = fixture();
		await write(env, { upserts: [doc("film-1", { alternativeTitles: ["Line one\nstill one", "Two"], guests: ["A\r\nB"] })] });
		expect(row(db, "film-1")).toMatchObject({ alternative_titles: "Line one still one\nTwo", guests: "A B" });
	});

	it("splits large upserts into chunks that each bind under D1's 2 MB value limit, and writes them all", async () => {
		const spy = d1Spy();
		const db = migratedSearchDb();
		const env = { SEARCH_DB: d1(db, { spy }) };
		const big = "word ".repeat(Math.floor(MAX_DOC_BYTES / 12));
		const upserts = Array.from({ length: 5 }, (_, i) => doc(`ep-${i}`, { description: big }));
		const resp = await write(env, { upserts });
		expect(resp.body.upserted).toBe(5);
		const upsertStatements = spy.directPrepares.filter((s) => s.startsWith("INSERT INTO search_docs"));
		expect(upsertStatements.length).toBeGreaterThan(1);
		expect(spy.sessions).toEqual([]); // writes go to the primary, never through a read session
		ftsIntact(db);
	});

	it("is one transaction: when any statement fails nothing is written, and the answer is a retryable 503", async () => {
		const { db, env } = fixture();
		await write(env, { upserts: [doc("ep-1", { title: "Kept" })] });
		db.exec("DROP TABLE doc_subjects"); // the subject statements now fail after the upsert ran
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const resp = await write(env, { upserts: [doc("ep-1", { title: "Lost", modifiedAt: T0 + 1 }), doc("ep-2")], deletes: [] });
		expect(resp).toEqual({ status: 503, body: SERVICE_UNAVAILABLE });
		expect(row(db, "ep-1")).toMatchObject({ title: "Kept", modified_at: T0 });
		expect(row(db, "ep-2")).toBeUndefined();
		expect(errors).toHaveBeenCalledWith("search: D1 failure", expect.objectContaining({ message: expect.stringMatching(/doc_subjects/) }));
	});

	it("is POST only", async () => {
		const { env } = fixture();
		expect((await write(env, undefined, "GET")).status).toBe(405);
	});

	describe("rejects a bad body with 400 and writes nothing", () => {
		const cases: [string, unknown, RegExp][] = [
			["invalid JSON", "{", /not valid JSON/],
			["a non-object", [], /JSON object/],
			["an unknown top-level field", { upserts: [doc("a")], upsert: [] }, /unknown field 'upsert'/],
			["nothing to do", { upserts: [], deletes: [] }, /both empty/],
			["upserts that is not an array", { upserts: {} }, /upserts must be an array/],
			["too many upserts", { upserts: Array.from({ length: MAX_UPSERTS + 1 }, (_, i) => doc(`d${i}`)) }, /at most 100 upserts/],
			["too many deletes", { deletes: Array.from({ length: MAX_DELETES + 1 }, (_, i) => `d${i}`) }, /at most 1000 deletes/],
			["a missing id", { upserts: [{ ...doc("a"), id: "" }] }, /upserts\[0\]\.id must be a non-empty string/],
			["a missing modifiedAt", { upserts: [{ ...doc("a"), modifiedAt: undefined }] }, /modifiedAt must be a non-negative integer/],
			["a fractional modifiedAt", { upserts: [doc("a", { modifiedAt: 1.5 })] }, /modifiedAt/],
			["a release with no zone", { upserts: [doc("a", { release: "2026-11-01T10:00:00" })] }, /release must be an ISO-8601/],
			["a date-only release", { upserts: [doc("a", { release: "2026-11-01" })] }, /release/],
			["a blank duration", { upserts: [doc("a", { duration: "" })] }, /duration/],
			["an unknown contentKind", { upserts: [doc("a", { contentKind: "Movie" as never })] }, /contentKind must be one of/],
			["an unknown document field", { upserts: [{ ...doc("a"), guest: ["x"] }] }, /upserts\[0\]: unknown field 'guest'/],
			["a non-string title", { upserts: [doc("a", { title: 5 as never })] }, /title must be a string/],
			["a non-array subjects", { upserts: [doc("a", { subjects: "x" as never })] }, /subjects must be an array of strings/],
			["a non-integer tmdbId", { upserts: [doc("a", { tmdbId: "12" as never })] }, /tmdbId must be an integer/],
			["the same id twice", { upserts: [doc("a"), doc("a")] }, /'a' appears more than once/],
			["an upsert and a delete of one id", { upserts: [doc("a")], deletes: ["a"] }, /'a' appears more than once/],
			["a document past the stored-size cap", { upserts: [doc("a", { description: "x".repeat(MAX_DOC_BYTES) })] }, /too large/]
		];
		it.each(cases)("%s", async (_name, body, message) => {
			const { db, env } = fixture();
			const resp = await write(env, body);
			expect(resp.status).toBe(400);
			expect(resp.body).toEqual({ error: { code: "", message: expect.stringMatching(message) } });
			expect(db.prepare("SELECT COUNT(*) AS n FROM search_docs").get()).toEqual({ n: 0 });
		});
	});

	it("accepts and stores every field the OpenAPI document schema advertises, and nothing else", () => {
		const sample = (key: string): unknown => {
			if (key === "id") return "doc-1";
			if (key === "contentKind") return "Film";
			if (key === "release") return "2026-11-01T10:00:00Z";
			if (key === "modifiedAt") return T0;
			if (["subjects", "trailers", "alternativeTitles", "guests"].includes(key)) return [`${key}-value`];
			if (/TmdbId$|TvdbId$|^tmdbId$|^tvdbId$/.test(key)) return 42;
			return `${key}-value`;
		};
		const keys = Object.keys(searchIndexDocSchema.shape);
		const full = Object.fromEntries(keys.map((k) => [k, sample(k)]));
		const [parsed] = parseAdminDocsRequest(JSON.stringify({ upserts: [full] })).upserts;
		expect(Object.keys(parsed).sort()).toEqual([...keys].sort());
		const stored = Object.values(toDocRow(parsed)).map(String).join("\n");
		for (const k of keys) expect(stored, k).toContain(String(sample(k)).replace(/^\[|\]$/g, ""));
		expect(() => parseAdminDocsRequest(JSON.stringify({ upserts: [{ ...full, notInSchema: 1 }] }))).toThrow(/unknown field 'notInSchema'/);
	});

	it("accepts and drops the legacy EpisodeSearchRecord fields that are not on the live index", () => {
		const parsed = parseAdminDocsRequest(
			JSON.stringify({ upserts: [{ ...doc("a"), podcastName: "x", episodeTitle: "y", episodeDescription: "z" }] })
		);
		expect(parsed.upserts[0]).not.toHaveProperty("podcastName");
	});
});
