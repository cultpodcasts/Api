import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import searchWorker from "../workers/search/src/index";
import type { SearchDocUpsert } from "../workers/search/src/admin-docs";
import { generationTriggerSql, REBUILD_ACTIONS, shadowTableSql, shadowTriggerSql } from "../workers/search/src/admin-rebuild";
import { PARKED_TABLES } from "../workers/search/src/index-generations";
import type { SearchEnv } from "../workers/search/src/env";
import { applySearchMigration, d1, migratedSearchDb, migratedSearchDbThrough } from "./support/searchD1";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";
import { SEARCH_ADMIN_REBUILD_URL, SEARCH_REBUILD_ACTIONS, searchAdminRebuild, searchAdminRebuildStatus } from "../src/searchAdminDocs";
import { appWithAuthPayload, testEnv } from "./honoTestApp";

/**
 * SP-2.3 (cultpodcasts/Api#226): rebuild the search index into shadow tables and swap it in with one
 * transaction; the RPP `D1SearchReconcile --rebuild` console drives these routes.
 */

const T0 = Date.UTC(2026, 10, 1);

function doc(id: string, overrides: Partial<SearchDocUpsert> = {}): SearchDocUpsert {
	return {
		id,
		contentKind: "Episode",
		title: `Title ${id}`,
		seriesName: "Series",
		description: `About ${id}`,
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

async function call(env: SearchEnv, path: string, body?: unknown, method = body === undefined && path === "/admin/rebuild" ? "GET" : "POST") {
	const resp = await searchWorker.fetch(
		new Request(`https://search.internal${path}`, {
			method,
			body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body ?? {})) : undefined
		}),
		env
	);
	return { status: resp.status, body: (await resp.json()) as any };
}

const rebuild = (env: SearchEnv, action: string, body?: unknown) => call(env, `/admin/rebuild/${action}`, body ?? {});
const status = async (env: SearchEnv) => (await call(env, "/admin/rebuild")).body;
const push = (env: SearchEnv, body: unknown) => call(env, "/admin/docs", body);

async function ids(env: SearchEnv, text: string): Promise<string[]> {
	const resp = await searchWorker.fetch(
		new Request("https://search.internal/indexes/cultpodcasts/docs/search", { method: "POST", body: JSON.stringify({ search: text }) }),
		env
	);
	return ((await resp.json()) as any).value.map((d: any) => d.id).sort();
}

/** Live triggers and indexes as name → SQL: a swap must leave exactly what the migrations made. */
function liveObjects(db: DatabaseSync): Record<string, string> {
	const rows = db
		.prepare(
			"SELECT name, sql FROM sqlite_master WHERE type IN ('index', 'trigger') AND sql IS NOT NULL " +
				"AND tbl_name IN ('search_docs', 'doc_subjects', 'search_fts') ORDER BY name"
		)
		.all() as { name: string; sql: string }[];
	return Object.fromEntries(rows.map((r) => [r.name, r.sql]));
}

function tables(db: DatabaseSync): string[] {
	return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'search_fts%_%' ORDER BY name").all() as { name: string }[])
		.map((r) => r.name);
}

/** Ids by subject through the doc_subjects → search_docs join (what subject filters and facets use). */
function bySubject(db: DatabaseSync, subject: string): string[] {
	return (
		db
			.prepare("SELECT d.id FROM doc_subjects s JOIN search_docs d ON d.rowid = s.rowid_ref WHERE s.subject = ? ORDER BY d.id")
			.all(subject) as { id: string }[]
	).map((r) => r.id);
}

function titleNorm(db: DatabaseSync, id: string): string | undefined {
	return (db.prepare("SELECT title_norm FROM search_docs WHERE id = ?").get(id) as { title_norm: string } | undefined)?.title_norm;
}

/** The live tables are consistent: subjects' key points at search_docs, no dangling rows, FTS matches its content. */
function assertLiveConsistent(db: DatabaseSync): void {
	const fk = db.prepare("PRAGMA foreign_key_list(doc_subjects)").all() as { table: string }[];
	expect(fk.map((r) => r.table)).toEqual(["search_docs"]);
	expect(db.prepare("PRAGMA foreign_key_check(doc_subjects)").all()).toEqual([]);
	expect(() => db.exec("INSERT INTO search_fts (search_fts, rank) VALUES ('integrity-check', 1)")).not.toThrow();
}

async function loadedRebuild(env: SearchEnv, docs: SearchDocUpsert[]): Promise<string> {
	const started = await rebuild(env, "start");
	expect(started.status).toBe(200);
	const rebuildId = started.body.rebuildId as string;
	const loaded = await rebuild(env, "docs", { rebuildId, upserts: docs });
	expect(loaded.status).toBe(200);
	return rebuildId;
}

describe("search Worker index rebuild (SP-2.3)", () => {
	let f: Fixture;
	beforeEach(async () => {
		f = fixture();
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect((await push(f.env, { upserts: [doc("old-1", { title: "Title Faderhuset" }), doc("old-2")] })).status).toBe(200);
	});
	afterEach(() => vi.restoreAllMocks());

	it("loads a shadow while the live index keeps serving, then swaps it in whole", async () => {
		// Arrange
		const migrated = liveObjects(f.db);
		const rebuildId = await loadedRebuild(f.env, [doc("new-1", { title: "Paulette Cooper" }), doc("new-2"), doc("new-3")]);
		const whileLoading = await ids(f.env, "Title");

		// Act
		const swapped = await rebuild(f.env, "swap", { rebuildId, expectedTotal: 3, expectedKinds: { Episode: 3 }, maxShrink: 1 });

		// Assert
		expect(whileLoading).toEqual(["old-1", "old-2"]);
		expect(swapped.status).toBe(200);
		expect(swapped.body).toMatchObject({ rebuildId, state: "swapped", verification: { ok: true, ftsRows: 3 } });
		expect(await ids(f.env, "Title")).toEqual(["new-2", "new-3"]);
		expect(await ids(f.env, "Paulette")).toEqual(["new-1"]);
		expect(await ids(f.env, "Faderhuset")).toEqual([]);
		expect(liveObjects(f.db)).toEqual(migrated);
		expect(await status(f.env)).toMatchObject({ state: "swapped", live: { total: 3 }, parked: { total: 2 }, shadow: null });
	});

	it("keeps the swapped-in index writable: updates and deletes still reach the full-text index", async () => {
		// Arrange
		const rebuildId = await loadedRebuild(f.env, [doc("new-1"), doc("new-2")]);
		await rebuild(f.env, "swap", { rebuildId, expectedTotal: 2, maxShrink: 1 });

		// Act
		const updated = await push(f.env, { upserts: [doc("new-1", { title: "Scientology Inc", modifiedAt: T0 + 1 })], deletes: ["new-2"] });

		// Assert
		expect(updated.body).toMatchObject({ upserted: 1, deleted: 1 });
		expect(await ids(f.env, "Inc")).toEqual(["new-1"]);
		expect(await ids(f.env, "Title")).toEqual([]);
		expect((await rebuild(f.env, "check", { rebuildId })).body).toMatchObject({ ok: true, integrity: { ok: true } });
	});

	it("writes pushes made during the load to both the live and the shadow index, so the swap loses none", async () => {
		// Arrange
		const rebuildId = await loadedRebuild(f.env, [doc("old-1"), doc("old-2", { modifiedAt: T0 + 5 })]);

		// Act
		await push(f.env, { upserts: [doc("pushed", { title: "Latecomer" }), doc("old-2", { title: "Stale push" })], deletes: ["old-1"] });
		const swapped = await rebuild(f.env, "swap", { rebuildId, expectedTotal: 2, maxShrink: 1 });

		// Assert
		expect(swapped.status).toBe(200);
		expect(await ids(f.env, "Latecomer")).toEqual(["pushed"]);
		expect(await ids(f.env, "Title")).toEqual(["old-2"]);
		expect(await ids(f.env, "Stale")).toEqual([]);
	});

	it("keeps subjects joined and title_norm filled through a swap and a swap-back", async () => {
		// Arrange
		const rebuildId = await loadedRebuild(f.env, [
			doc("new-1", { title: "The Sea Org: Inside", subjects: ["Sea Org"] }),
			doc("new-2", { subjects: ["Scientology", "Sea Org"] })
		]);

		// Act
		await rebuild(f.env, "swap", { rebuildId, expectedTotal: 2, maxShrink: 1 });
		const afterSwap = { sea: bySubject(f.db, "Sea Org"), scientology: bySubject(f.db, "Scientology"), norm: titleNorm(f.db, "new-1") };
		assertLiveConsistent(f.db);
		await rebuild(f.env, "swap-back", { rebuildId });

		// Assert
		expect(afterSwap).toEqual({ sea: ["new-1", "new-2"], scientology: ["new-2"], norm: "the sea org inside" });
		expect(bySubject(f.db, "Scientology")).toEqual(["old-1", "old-2"]);
		expect(bySubject(f.db, "Sea Org")).toEqual([]);
		expect(titleNorm(f.db, "old-1")).toBe("title faderhuset");
		assertLiveConsistent(f.db);
	});

	it("keeps writing the parked index after the swap, so a swap-back restores every push", async () => {
		// Arrange
		const rebuildId = await loadedRebuild(f.env, [doc("old-1"), doc("old-2")]);
		await rebuild(f.env, "swap", { rebuildId, expectedTotal: 2, maxShrink: 1 });

		// Act
		const pushed = await push(f.env, {
			upserts: [doc("late", { title: "Latecomer", subjects: ["Sea Org"] }), doc("old-1", { title: "Renamed Faderhuset", modifiedAt: T0 + 1 })],
			deletes: ["old-2"]
		});
		const back = await rebuild(f.env, "swap-back", { rebuildId });

		// Assert
		expect(pushed.status).toBe(200);
		expect(back.status).toBe(200);
		expect(await ids(f.env, "Latecomer")).toEqual(["late"]);
		expect(await ids(f.env, "Renamed")).toEqual(["old-1"]);
		expect(await ids(f.env, "Title")).toEqual([]);
		expect(bySubject(f.db, "Sea Org")).toEqual(["late"]);
		expect(titleNorm(f.db, "old-1")).toBe("renamed faderhuset");
		assertLiveConsistent(f.db);
		expect(await status(f.env)).toMatchObject({ state: "swappedBack", live: { total: 2 } });
	});

	it("refuses writes and rebuild actions when the recorded rebuild state is unreadable, instead of ignoring it", async () => {
		// Arrange
		await loadedRebuild(f.env, [doc("new-1")]);
		f.db.prepare("UPDATE search_meta SET value = ? WHERE key = 'rebuild'").run("{not json");

		// Act
		const pushed = await push(f.env, { upserts: [doc("x")] });
		const statusResp = await call(f.env, "/admin/rebuild");
		const started = await rebuild(f.env, "start");

		// Assert
		expect(pushed.status).toBe(503);
		expect(pushed.body.error.code).toBe("RebuildStateUnreadable");
		for (const r of [statusResp, started]) {
			expect(r.status).toBe(409);
			expect(r.body.error.code).toBe("RebuildStateUnreadable");
			expect(r.body.error.message).toContain("by hand");
		}
		expect(await ids(f.env, "Title")).toEqual(["old-1", "old-2"]);
	});

	it("refuses the swap and changes nothing when the shadow fails verification", async () => {
		// Arrange
		const rebuildId = await loadedRebuild(f.env, [doc("new-1")]);

		// Act
		const wrongCount = await rebuild(f.env, "swap", { rebuildId, expectedTotal: 5, tolerance: 1, maxShrink: 1 });
		const wrongKind = await rebuild(f.env, "swap", { rebuildId, expectedTotal: 1, expectedKinds: { Film: 1 }, maxShrink: 1 });
		const shrank = await rebuild(f.env, "swap", { rebuildId, expectedTotal: 1 });

		// Assert
		for (const r of [wrongCount, wrongKind, shrank]) {
			expect(r.status).toBe(409);
			expect(r.body.error.code).toBe("VerificationFailed");
		}
		expect(wrongCount.body.verification.failures[0]).toContain("expected 5");
		expect(wrongKind.body.verification.failures.join()).toContain("Film");
		expect(shrank.body.verification.failures[0]).toContain("smaller than the live index (2)");
		expect(await status(f.env)).toMatchObject({ state: "loading", live: { total: 2 }, shadow: { total: 1 } });
		expect(await ids(f.env, "Title")).toEqual(["old-1", "old-2"]);
	});

	it("finishes by dropping the parked tables, and a later rebuild starts cleanly", async () => {
		// Arrange
		const migrated = liveObjects(f.db);
		const first = await loadedRebuild(f.env, [doc("a"), doc("b")]);
		await rebuild(f.env, "swap", { rebuildId: first, expectedTotal: 2, maxShrink: 1 });

		// Act
		const finished = await rebuild(f.env, "finish", { rebuildId: first });
		const second = await loadedRebuild(f.env, [doc("c"), doc("d")]);
		const swappedAgain = await rebuild(f.env, "swap", { rebuildId: second, expectedTotal: 2 });
		await rebuild(f.env, "finish", { rebuildId: second });

		// Assert
		expect(finished.body).toEqual({ rebuildId: first, state: "finished" });
		expect(swappedAgain.status).toBe(200);
		expect(await ids(f.env, "Title")).toEqual(["c", "d"]);
		expect(liveObjects(f.db)).toEqual(migrated);
		expect(tables(f.db)).toEqual(["doc_subjects", "search_docs", "search_fts", "search_meta"]);
		expect(await status(f.env)).toMatchObject({ state: "none", rebuildId: null, shadow: null, parked: null });
	});

	it("swaps back to the previous index when the console's checks fail, then aborts the rejected one", async () => {
		// Arrange
		const migrated = liveObjects(f.db);
		const rebuildId = await loadedRebuild(f.env, [doc("bad-1"), doc("bad-2")]);
		await rebuild(f.env, "swap", { rebuildId, expectedTotal: 2, maxShrink: 1 });

		// Act
		const back = await rebuild(f.env, "swap-back", { rebuildId });
		const aborted = await rebuild(f.env, "abort", { rebuildId });
		const pushed = await push(f.env, { upserts: [doc("old-1", { title: "Renamed", modifiedAt: T0 + 1 })] });

		// Assert
		expect(back.body).toMatchObject({ rebuildId, state: "swappedBack" });
		expect(aborted.body).toEqual({ rebuildId, state: "aborted" });
		expect(pushed.body.upserted).toBe(1);
		expect(await ids(f.env, "Renamed")).toEqual(["old-1"]);
		expect(await ids(f.env, "Title")).toEqual(["old-2"]);
		expect(liveObjects(f.db)).toEqual(migrated);
		expect(tables(f.db)).toEqual(["doc_subjects", "search_docs", "search_fts", "search_meta"]);
	});

	it("checks the live index after a swap: content integrity, counts and sample hits", async () => {
		// Arrange
		const rebuildId = await loadedRebuild(f.env, [doc("new-1", { title: "Paulette Cooper" }), doc("new-2", { contentKind: "Film" })]);
		await rebuild(f.env, "swap", { rebuildId, expectedTotal: 2, maxShrink: 1 });

		// Act
		const checked = await rebuild(f.env, "check", { rebuildId, sampleQueries: ["paulette cooper", "nothing matches this"] });

		// Assert
		expect(checked.status).toBe(200);
		expect(checked.body).toMatchObject({
			ok: false,
			integrity: { ok: true },
			counts: { total: 2, kinds: { Episode: 1, Film: 1 } },
			samples: [
				{ query: "paulette cooper", hits: 1 },
				{ query: "nothing matches this", hits: 0 }
			]
		});
	});

	it("aborts a load: drops the shadow and its triggers, and pushes stop going to it", async () => {
		// Arrange
		const migrated = liveObjects(f.db);
		const rebuildId = await loadedRebuild(f.env, [doc("new-1")]);

		// Act
		const aborted = await rebuild(f.env, "abort", { rebuildId });
		const pushed = await push(f.env, { upserts: [doc("after")] });

		// Assert
		expect(aborted.status).toBe(200);
		expect(pushed.status).toBe(200);
		expect(liveObjects(f.db)).toEqual(migrated);
		expect(tables(f.db)).toEqual(["doc_subjects", "search_docs", "search_fts", "search_meta"]);
	});

	it("answers 409 for an action the rebuild's state does not allow, and changes nothing", async () => {
		// Arrange
		const rebuildId = await loadedRebuild(f.env, [doc("new-1")]);
		const other = crypto.randomUUID();

		// Act
		const results = [
			await rebuild(f.env, "start"),
			await rebuild(f.env, "docs", { rebuildId: other, upserts: [doc("x")] }),
			await rebuild(f.env, "finish", { rebuildId }),
			await rebuild(f.env, "swap-back", { rebuildId }),
			await rebuild(f.env, "check", { rebuildId })
		];
		await rebuild(f.env, "swap", { rebuildId, expectedTotal: 1, maxShrink: 1 });
		const abortLive = await rebuild(f.env, "abort", { rebuildId });

		// Assert
		for (const r of [...results, abortLive]) {
			expect(r.status).toBe(409);
			expect(r.body.error.code).toBe("RebuildConflict");
		}
		expect(results[0].body.error.message).toContain("abort it first");
		expect(abortLive.body.error.message).toContain("swap it back or finish it");
		expect(await status(f.env)).toMatchObject({ state: "swapped", live: { total: 1 } });
	});

	it("answers 400 for a bad body, 405 for the wrong method and 404 for an unknown action", async () => {
		// Arrange
		const rebuildId = await loadedRebuild(f.env, [doc("new-1")]);

		// Act
		const unknownField = await rebuild(f.env, "swap", { rebuildId, expectedTotal: 1, force: true });
		const badCount = await rebuild(f.env, "swap", { rebuildId, expectedTotal: -1 });
		const badKind = await rebuild(f.env, "swap", { rebuildId, expectedTotal: 1, expectedKinds: { Podcast: 1 } });
		const badDoc = await rebuild(f.env, "docs", { rebuildId, upserts: [{ id: "x" }] });
		const tooManySamples = await rebuild(f.env, "check", { rebuildId, sampleQueries: [...REBUILD_ACTIONS, ...REBUILD_ACTIONS] });
		const notJson = await rebuild(f.env, "abort", "{");
		const getAction = await call(f.env, "/admin/rebuild/start", undefined, "GET");
		const postStatus = await call(f.env, "/admin/rebuild", {}, "POST");
		const unknown = await rebuild(f.env, "explode");

		// Assert
		for (const r of [unknownField, badCount, badKind, badDoc, tooManySamples, notJson]) expect(r.status).toBe(400);
		expect(unknownField.body.error.message).toBe("unknown field 'force'");
		expect([getAction.status, postStatus.status, unknown.status]).toEqual([405, 405, 404]);
		expect(await status(f.env)).toMatchObject({ state: "loading", shadow: { total: 1 } });
	});

	it("refuses to start over leftover shadow or parked tables with no rebuild recorded", async () => {
		// Arrange
		f.db.exec("CREATE TABLE search_docs_old (id TEXT)");

		// Act
		const started = await rebuild(f.env, "start");

		// Assert
		expect(started.status).toBe(409);
		expect(started.body.error.message).toContain("search_docs_old exists");
	});

	it("answers 503 and changes nothing when D1 fails mid-swap", async () => {
		// Arrange
		const rebuildId = await loadedRebuild(f.env, [doc("new-1"), doc("new-2")]);
		f.db.exec("CREATE TABLE doc_subjects_old (x INTEGER)");

		// Act
		const swapped = await rebuild(f.env, "swap", { rebuildId, expectedTotal: 2, maxShrink: 1 });

		// Assert
		expect(swapped.status).toBe(503);
		expect(await ids(f.env, "Title")).toEqual(["old-1", "old-2"]);
		expect(await status(f.env)).toMatchObject({ state: "loading", live: { total: 2 }, shadow: { total: 2 } });
	});
});

describe("shadow schema SQL (SP-2.3)", () => {
	it("renames only the table, keeps the FTS content table's post-swap name and repoints the subjects key", () => {
		// Arrange
		const fts = "CREATE VIRTUAL TABLE \"search_fts\" USING fts5 (title, content = 'search_docs', content_rowid = 'rowid')";
		const subjects = 'CREATE TABLE "doc_subjects" (rowid_ref INTEGER NOT NULL REFERENCES "search_docs" (rowid) ON DELETE CASCADE)';

		// Act
		const shadowFts = shadowTableSql({ type: "table", name: "search_fts", tbl_name: "search_fts", sql: fts });
		const shadowSubjects = shadowTableSql({ type: "table", name: "doc_subjects", tbl_name: "doc_subjects", sql: subjects });

		// Assert
		expect(shadowFts).toBe("CREATE VIRTUAL TABLE search_fts_new USING fts5 (title, content = 'search_docs', content_rowid = 'rowid')");
		expect(shadowSubjects).toBe("CREATE TABLE doc_subjects_new (rowid_ref INTEGER NOT NULL REFERENCES search_docs_new (rowid) ON DELETE CASCADE)");
	});

	it("points a trigger, its table and the FTS special column at the shadow names", () => {
		// Arrange
		const trigger =
			"CREATE TRIGGER search_docs_ad AFTER DELETE ON search_docs BEGIN INSERT INTO search_fts (search_fts, rowid) VALUES ('delete', old.rowid); END";

		// Act
		const shadow = shadowTriggerSql(trigger);

		// Assert
		expect(shadow).toBe(
			"CREATE TRIGGER search_docs_ad_new AFTER DELETE ON search_docs_new BEGIN INSERT INTO search_fts_new (search_fts_new, rowid) VALUES ('delete', old.rowid); END"
		);
	});

	it("points a trigger at the parked names for the parked generation", () => {
		// Arrange
		const trigger =
			'CREATE TRIGGER "search_docs_ad" AFTER DELETE ON "search_docs" BEGIN INSERT INTO search_fts (search_fts, rowid) VALUES (\'delete\', old.rowid); END';

		// Act
		const parked = generationTriggerSql(trigger, PARKED_TABLES);

		// Assert
		expect(parked).toBe(
			"CREATE TRIGGER search_docs_ad_old AFTER DELETE ON search_docs_old BEGIN INSERT INTO search_fts_old (search_fts_old, rowid) VALUES ('delete', old.rowid); END"
		);
	});
});


describe("search Worker index rebuild schema preflight (RPP #1411)", () => {
	afterEach(() => vi.restoreAllMocks());

	it("answers 409 for docs when a shadow was started before a later live migration", async () => {
		// Arrange: start the rebuild on schema 2, then migrate live to 3 so the shadow is stale.
		const db = migratedSearchDbThrough(2);
		const env: SearchEnv = { SEARCH_DB: d1(db), searchEnvironment: "preview" };
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const started = await rebuild(env, "start");
		expect(started.status).toBe(200);
		applySearchMigration(db, "0003_youtube_alternates.sql");

		// Act
		const loaded = await rebuild(env, "docs", { rebuildId: started.body.rebuildId, upserts: [doc("new-1")] });

		// Assert
		expect(loaded.status).toBe(409);
		expect(loaded.body.error.code).toBe("RebuildConflict");
		expect(loaded.body.error.message).toBe("rebuild was started on an older schema: abort and start again");
	});

	it("answers 409 for swap-back when the parked generation predates a later live migration", async () => {
		// Arrange: swap a schema-2 shadow into live (empty: docs would write youtube_alternates
		// which schema 2 does not have), then migrate, so the parked copy is stale.
		const db = migratedSearchDbThrough(2);
		const env: SearchEnv = { SEARCH_DB: d1(db), searchEnvironment: "preview" };
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const started = await rebuild(env, "start");
		expect(started.status).toBe(200);
		const rebuildId = started.body.rebuildId as string;
		const swapped = await rebuild(env, "swap", { rebuildId, expectedTotal: 0, maxShrink: 1 });
		expect(swapped.status).toBe(200);
		applySearchMigration(db, "0003_youtube_alternates.sql");

		// Act
		const back = await rebuild(env, "swap-back", { rebuildId });

		// Assert
		expect(back.status).toBe(409);
		expect(back.body.error.code).toBe("RebuildConflict");
		expect(back.body.error.message).toBe("parked generation predates migration 3: finish, don't swap back");
	});
});

describe("api Worker /search/admin/rebuild proxy (SP-2.3)", () => {
	const M2M_WRITER = { gty: "client_credentials", sub: "abc@clients", scope: "write:search-index" } as unknown as Auth0JwtPayload;
	const PERSON = { sub: "auth0|person", scope: "write:search-index", permissions: ["write:search-index"] } as unknown as Auth0JwtPayload;

	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "info").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	function binding(respond: (req: Request) => Promise<Response> | Response) {
		const calls: { url: string; method: string; body: string }[] = [];
		const fetcher = {
			fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const req = new Request(input, init);
				const body = req.method === "POST" ? await req.clone().text() : "";
				calls.push({ url: req.url, method: req.method, body });
				return respond(req);
			})
		} as unknown as Fetcher;
		return { fetcher, calls };
	}

	function post(payload: Auth0JwtPayload | null, SEARCH: Fetcher | undefined, action: string, body: unknown = {}) {
		const app = appWithAuthPayload("/search/admin/rebuild/:action", "post", searchAdminRebuild, payload);
		return app.request(`/search/admin/rebuild/${action}`, { method: "POST", body: JSON.stringify(body) }, testEnv({ SEARCH }));
	}

	function get(payload: Auth0JwtPayload | null, SEARCH: Fetcher | undefined) {
		const app = appWithAuthPayload("/search/admin/rebuild", "get", searchAdminRebuildStatus, payload);
		return app.request("/search/admin/rebuild", { method: "GET" }, testEnv({ SEARCH }));
	}

	it("forwards each action's body to the search Worker and relays its answer uncached", async () => {
		// Arrange
		const { fetcher, calls } = binding(() => Response.json({ error: { code: "RebuildConflict", message: "no rebuild is in progress" } }, { status: 409 }));
		const body = { rebuildId: crypto.randomUUID() };

		// Act
		const resp = await post(M2M_WRITER, fetcher, "finish", body);

		// Assert
		expect(resp.status).toBe(409);
		expect(resp.headers.get("cache-control")).toBe("no-store");
		expect(((await resp.json()) as any).error.code).toBe("RebuildConflict");
		expect(calls).toEqual([{ url: `${SEARCH_ADMIN_REBUILD_URL}/finish`, method: "POST", body: JSON.stringify(body) }]);
	});

	it("runs a whole rebuild end to end through the binding: start, load, swap, check, finish", async () => {
		// Arrange
		const f = fixture();
		const { fetcher } = binding((req) => searchWorker.fetch(req, f.env));

		// Act
		const started = (await (await post(M2M_WRITER, fetcher, "start")).json()) as any;
		const rebuildId = started.rebuildId;
		await post(M2M_WRITER, fetcher, "docs", { rebuildId, upserts: [doc("a", { title: "Paulette" })] });
		const swapped = await post(M2M_WRITER, fetcher, "swap", { rebuildId, expectedTotal: 1 });
		const checked = (await (await post(M2M_WRITER, fetcher, "check", { rebuildId, sampleQueries: ["paulette"] })).json()) as any;
		const finished = await post(M2M_WRITER, fetcher, "finish", { rebuildId });
		const state = (await (await get(M2M_WRITER, fetcher)).json()) as any;

		// Assert
		expect(swapped.status).toBe(200);
		expect(checked).toMatchObject({ ok: true, samples: [{ query: "paulette", hits: 1 }] });
		expect(finished.status).toBe(200);
		expect(state).toMatchObject({ state: "none", live: { total: 1, kinds: { Episode: 1 } }, shadow: null, parked: null });
	});

	it("refuses anyone but the index writer's M2M client, and an unknown action, before calling the search Worker", async () => {
		// Arrange
		const { fetcher, calls } = binding(() => Response.json({}));

		// Act
		const statuses = [
			(await post(null, fetcher, "start")).status,
			(await post(PERSON, fetcher, "start")).status,
			(await get({ gty: "client_credentials", sub: "x@clients", scope: "curate" } as unknown as Auth0JwtPayload, fetcher)).status,
			(await post(M2M_WRITER, fetcher, "explode")).status,
			(await post(M2M_WRITER, undefined, "start")).status
		];

		// Assert
		expect(statuses).toEqual([401, 403, 403, 404, 503]);
		expect(calls).toEqual([]);
	});

	it("keeps the api Worker's action list in step with the search Worker's", () => {
		// Arrange
		const api = [...SEARCH_REBUILD_ACTIONS];

		// Act
		const worker = [...REBUILD_ACTIONS];

		// Assert
		expect(api).toEqual(worker);
	});
});
