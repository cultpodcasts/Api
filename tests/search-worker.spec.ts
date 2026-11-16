import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import searchWorker from "../workers/search/src/index";
import { d1, migratedSearchDb, searchMigrationFiles, searchMigrationsDir } from "./support/searchD1";
import { SEARCH_SCHEMA_VERSION } from "../workers/search/src/health";
import type { SearchEnv } from "../workers/search/src/env";
// @ts-ignore - plain .mjs CLI helper (SP-1.10)
import { applyIds } from "../infra/terraform/scripts/sync-wrangler-ids.mjs";

/** SP-1.1 (cultpodcasts/Api#219): dedicated search D1 database, bindings and schema. */

const root = process.cwd();
const migrationsDir = searchMigrationsDir;

/** Strip // and /* *\/ comments from JSONC without touching string contents. */
function parseJsonc(text: string): any {
	let out = "";
	let i = 0;
	let inString = false;
	while (i < text.length) {
		const ch = text[i];
		const next = text[i + 1];
		if (inString) {
			out += ch;
			if (ch === "\\") {
				out += next;
				i += 2;
				continue;
			}
			if (ch === '"') inString = false;
			i++;
			continue;
		}
		if (ch === '"') {
			inString = true;
			out += ch;
			i++;
			continue;
		}
		if (ch === "/" && next === "/") {
			while (i < text.length && text[i] !== "\n") i++;
			continue;
		}
		if (ch === "/" && next === "*") {
			i = text.indexOf("*/", i + 2) + 2;
			continue;
		}
		out += ch;
		i++;
	}
	return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const migratedDb = migratedSearchDb;

const failingD1 = {
	prepare() {
		throw new Error("D1_ERROR: no such table: search_meta");
	}
} as unknown as D1Database;

function insertDoc(db: DatabaseSync, doc: Record<string, unknown>) {
	const row = { kind: "Episode", release: "2026-11-01T00:00:00Z", duration: "01:00:00", ...doc };
	const cols = Object.keys(row);
	db.prepare(`INSERT INTO search_docs (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(
		...(Object.values(row) as never[])
	);
}

const migrationFiles = searchMigrationFiles;

/**
 * Content-aware FTS5 integrity check (rank = 1): compares search_fts with search_docs, so it
 * catches stale terms left by a REPLACE. Throws (SQLITE_CORRUPT_VTAB) when they differ.
 */
function ftsIntegrity(db: DatabaseSync): void {
	db.exec("INSERT INTO search_fts(search_fts, rank) VALUES ('integrity-check', 1)");
}

/** FTS rowids matching, without joining back to search_docs (shows stale index entries). */
function ftsRowids(db: DatabaseSync, query: string): number[] {
	return (db.prepare("SELECT rowid FROM search_fts WHERE search_fts MATCH ? ORDER BY rowid").all(query) as {
		rowid: number;
	}[]).map((r) => r.rowid);
}

function match(db: DatabaseSync, query: string): string[] {
	return (
		db
			.prepare(
				"SELECT d.id FROM search_fts JOIN search_docs d ON d.rowid = search_fts.rowid WHERE search_fts MATCH ? ORDER BY d.id"
			)
			.all(query) as { id: string }[]
	).map((r) => r.id);
}

describe("wrangler.search.jsonc", () => {
	const config = parseJsonc(readFileSync(resolve(root, "wrangler.search.jsonc"), "utf8"));
	const apiConfig = parseJsonc(readFileSync(resolve(root, "wrangler.jsonc"), "utf8"));
	const apiDbIds = new Set<string>(
		[apiConfig, ...Object.values(apiConfig.env as Record<string, any>)].flatMap((c: any) =>
			(c.d1_databases ?? []).map((d: any) => d.database_id)
		)
	);

	it.each([
		["production", config, "search", "cultpodcasts-search"],
		["preview", config.env.preview, "search-preview", "cultpodcasts-search-preview"]
	])("%s Worker binds SEARCH_DB to its dedicated search database", (_label, env, name, databaseName) => {
		expect(env.name ?? config.name).toBe(name);
		expect(env.d1_databases).toHaveLength(1);
		const [binding] = env.d1_databases;
		expect(binding.binding).toBe("SEARCH_DB");
		expect(binding.database_name).toBe(databaseName);
		expect(binding.migrations_dir).toBe("workers/search/migrations");
		// Dedicated: never the api Worker's apiDB.
		expect(binding.database_name).not.toBe("cultpodcasts-api");
		expect(apiDbIds.has(binding.database_id)).toBe(false);
	});

	it("preview and production bind separate databases", () => {
		const production = config.d1_databases[0];
		const preview = config.env.preview.d1_databases[0];
		expect(preview.database_name).not.toBe(production.database_name);
		expect(preview.database_id).not.toBe(production.database_id);
	});

	it("binds the Terraform-provisioned database ids (SP-1.10): UUIDs, preview ≠ production, local stays local", () => {
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
		const production = config.d1_databases[0].database_id;
		const preview = config.env.preview.d1_databases[0].database_id;
		expect(production).toMatch(uuid);
		expect(preview).toMatch(uuid);
		expect(preview).not.toBe(production);
		expect(config.env.local.d1_databases[0].database_id).toBe("local-cultpodcasts-search");
		expect(readFileSync(resolve(root, "wrangler.search.jsonc"), "utf8")).not.toContain("PLACEHOLDER-");
	});

	it("is already in sync for the post-apply id check (sync-wrangler-ids.mjs is a no-op)", () => {
		const text = readFileSync(resolve(root, "wrangler.search.jsonc"), "utf8");
		const ids = {
			"cultpodcasts-search": config.d1_databases[0].database_id,
			"cultpodcasts-search-preview": config.env.preview.d1_databases[0].database_id
		};
		const result = applyIds(text, ids);
		expect(result.text).toBe(text);
		expect(result.found.sort()).toEqual(["cultpodcasts-search", "cultpodcasts-search-preview"]);
	});

	it.each([
		["production", config],
		["preview", config.env.preview]
	])("%s Worker is service-binding only (no workers.dev, preview URLs or routes)", (_label, env) => {
		expect(env.workers_dev).toBe(false);
		expect(env.preview_urls).toBe(false);
		expect(env.routes).toBeUndefined();
		expect(env.route).toBeUndefined();
	});

	it("points at the search Worker entry module", () => {
		expect(config.main).toBe("workers/search/src/index.ts");
	});

	it.each([
		["production (top level)", apiConfig, "search"],
		["production env", apiConfig.env.production, "search"],
		["preview", apiConfig.env.preview, "search-preview"],
		["local", apiConfig.env.local, "search-local"]
	])("api %s binds SEARCH to the %s Worker over a service binding (SP-1.3)", (_label, env, service) => {
		const bindings = (env.services ?? []).filter((s: any) => s.binding === "SEARCH");
		expect(bindings).toEqual([{ binding: "SEARCH", service }]);
	});

	it("api-preview never binds the production search Worker", () => {
		expect(JSON.stringify(apiConfig.env.preview.services)).not.toMatch(/"service":"search"/);
	});

	it("api SEARCH targets are the search Worker names in wrangler.search.jsonc", () => {
		expect(config.name).toBe("search");
		expect(config.env.preview.name).toBe("search-preview");
		// env.local has no explicit name, so `wrangler dev --env local` registers `search-local`.
		expect(config.env.local.name).toBeUndefined();
	});

	it("does not bind the search database on the api Worker (reached via service binding, SP-1.3)", () => {
		expect(JSON.stringify(apiConfig)).not.toContain("cultpodcasts-search");
	});
});

describe("search D1 schema (workers/search/migrations)", () => {
	it("applies every migration in order and ends at the schema version the Worker expects", () => {
		const db = migratedDb();
		const row = db.prepare("SELECT value FROM search_meta WHERE key = 'schema_version'").get() as {
			value: string;
		};
		expect(row.value).toBe(SEARCH_SCHEMA_VERSION);
		// Convention (workers/search/README.md): one migration per schema version.
		expect(String(migrationFiles().length)).toBe(SEARCH_SCHEMA_VERSION);
	});

	it("every migration after 0001 moves schema_version to its own number", () => {
		const files = migrationFiles();
		expect(files[0]).toMatch(/^0001_/);
		files.slice(1).forEach((file, i) => {
			const sql = readFileSync(resolve(migrationsDir, file), "utf8");
			expect(sql, file).toMatch(
				new RegExp(`UPDATE\\s+search_meta\\s+SET\\s+value\\s*=\\s*'${i + 2}'\\s+WHERE\\s+key\\s*=\\s*'schema_version'`, "i")
			);
		});
	});

	it("uses porter unicode61 and the agreed FTS column order", () => {
		const db = migratedDb();
		const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'search_fts'").get() as { sql: string };
		expect(sql).toMatch(/tokenize\s*=\s*'porter unicode61'/);
		const columns = (db.prepare("PRAGMA table_info(search_fts)").all() as { name: string }[]).map((c) => c.name);
		expect(columns).toEqual([
			"title",
			"alternative_titles",
			"series_name",
			"subjects_text",
			"description",
			"guests",
			"publisher_search_terms",
			"episode_search_terms"
		]);
	});

	it("stores full descriptions, guests, AKAs, identity ids and modified_at", () => {
		const db = migratedDb();
		const columns = (db.prepare("PRAGMA table_info(search_docs)").all() as { name: string }[]).map((c) => c.name);
		expect(columns).toEqual(
			expect.arrayContaining([
				"id",
				"kind",
				"description",
				"guests",
				"alternative_titles",
				"imdb_id",
				"tmdb_id",
				"tvdb_id",
				"series_imdb_id",
				"series_tmdb_id",
				"series_tvdb_id",
				"trailers",
				"modified_at"
			])
		);
		const long = "cult ".repeat(2000) + "needleword";
		insertDoc(db, { id: "long", title: "Long", description: long });
		expect(match(db, "needleword")).toEqual(["long"]);
	});

	it("finds a film by its AKA and a guest by name", () => {
		const db = migratedDb();
		insertDoc(db, { id: "film", kind: "Film", title: "Faderhuset", alternative_titles: "Father's House" });
		insertDoc(db, { id: "ep", title: "Leaving", guests: "Paulette Cooper" });
		expect(match(db, '"father\'s house"')).toEqual(["film"]);
		expect(match(db, "guests:cooper")).toEqual(["ep"]);
	});

	it("stems with porter (en.lucene parity)", () => {
		const db = migratedDb();
		insertDoc(db, { id: "a", title: "Running from the group" });
		expect(match(db, "runs")).toEqual(["a"]);
	});

	it("keeps FTS in step on update and delete, and cascades subjects", () => {
		const db = migratedDb();
		insertDoc(db, { id: "a", title: "Original wording" });
		const { rowid } = db.prepare("SELECT rowid FROM search_docs WHERE id = 'a'").get() as { rowid: number };
		db.prepare("INSERT INTO doc_subjects (rowid_ref, subject) VALUES (?, 'Scientology')").run(rowid);

		db.prepare("UPDATE search_docs SET title = 'Replacement wording' WHERE id = 'a'").run();
		expect(match(db, "original")).toEqual([]);
		expect(match(db, "replacement")).toEqual(["a"]);

		db.prepare("DELETE FROM search_docs WHERE id = 'a'").run();
		expect(match(db, "replacement")).toEqual([]);
		expect((db.prepare("SELECT COUNT(*) AS n FROM doc_subjects").get() as { n: number }).n).toBe(0);
		ftsIntegrity(db);
	});

	it("keeps FTS in step on the only allowed upsert, INSERT … ON CONFLICT(id) DO UPDATE", () => {
		const db = migratedDb();
		insertDoc(db, { id: "a", title: "Original wording" });
		const before = db.prepare("SELECT rowid FROM search_docs WHERE id = 'a'").get() as { rowid: number };
		db.prepare(
			`INSERT INTO search_docs (id, kind, release, duration, title) VALUES ('a', 'Episode', '2026-11-02T00:00:00Z', '01:00:00', 'Replacement wording')
			 ON CONFLICT(id) DO UPDATE SET title = excluded.title, release = excluded.release`
		).run();
		const after = db.prepare("SELECT rowid FROM search_docs WHERE id = 'a'").get() as { rowid: number };
		expect(after.rowid).toBe(before.rowid);
		ftsIntegrity(db);
		expect(match(db, "replacement")).toEqual(["a"]);
		expect(match(db, "original")).toEqual([]);
		expect(ftsRowids(db, "original")).toEqual([]);
	});

	it("documents why INSERT OR REPLACE is banned: it leaves stale FTS terms behind", () => {
		const db = migratedDb();
		insertDoc(db, { id: "a", title: "Original wording" });
		db.prepare(
			"INSERT OR REPLACE INTO search_docs (id, kind, release, duration, title) VALUES ('a', 'Episode', '2026-11-02T00:00:00Z', '01:00:00', 'Replacement wording')"
		).run();
		// The old row's terms are still indexed under a rowid that no longer exists.
		expect(ftsRowids(db, "original")).toHaveLength(1);
		expect(() => ftsIntegrity(db)).toThrow();
		const sql = readFileSync(resolve(migrationsDir, "0001_search_schema.sql"), "utf8");
		expect(sql).toMatch(/ON CONFLICT\(id\) DO UPDATE/);
		expect(sql).toMatch(/NEVER `INSERT OR REPLACE`/);
	});

	it("re-indexes only when an FTS column changes", () => {
		const db = migratedDb();
		const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'search_docs_au'").get() as { sql: string };
		const columns = (db.prepare("PRAGMA table_info(search_fts)").all() as { name: string }[]).map((c) => c.name);
		const updateOf = /AFTER UPDATE OF([\s\S]*?)ON search_docs/.exec(sql)?.[1] ?? "";
		expect(updateOf.split(",").map((c) => c.trim())).toEqual(columns);

		insertDoc(db, { id: "a", title: "Stable wording" });
		db.prepare("UPDATE search_docs SET image = 'https://img.example/a.jpg', modified_at = '2026-11-16T00:00:00Z' WHERE id = 'a'").run();
		ftsIntegrity(db);
		expect(match(db, "stable")).toEqual(["a"]);
	});

	it("rejects a duplicate document id", () => {
		const db = migratedDb();
		insertDoc(db, { id: "dup" });
		expect(() => insertDoc(db, { id: "dup" })).toThrow(/UNIQUE/);
	});
});

describe("search Worker", () => {
	const call = (env: SearchEnv, path: string, method = "GET") =>
		searchWorker.fetch(new Request(`https://search.internal${path}`, { method }), env);

	it("GET /health is 200 when the schema version matches", async () => {
		const resp = await call({ SEARCH_DB: d1(migratedDb()), searchEnvironment: "preview" }, "/health");
		expect(resp.status).toBe(200);
		expect(resp.headers.get("cache-control")).toBe("no-store");
		expect(await resp.json()).toEqual({
			ok: true,
			worker: "search",
			environment: "preview",
			schemaVersion: SEARCH_SCHEMA_VERSION,
			expectedSchemaVersion: SEARCH_SCHEMA_VERSION
		});
	});

	it("GET /health is 503 when the schema is behind", async () => {
		const db = migratedDb();
		db.exec("UPDATE search_meta SET value = '0' WHERE key = 'schema_version'");
		const resp = await call({ SEARCH_DB: d1(db) }, "/health");
		expect(resp.status).toBe(503);
		expect(await resp.json()).toMatchObject({ ok: false, schemaVersion: "0" });
	});

	it("GET /health is 503 (retryable, not 4xx) when D1 fails or migrations are missing", async () => {
		const resp = await call({ SEARCH_DB: failingD1 }, "/health");
		expect(resp.status).toBe(503);
		expect(await resp.json()).toMatchObject({ ok: false, schemaVersion: null, error: expect.stringMatching(/search_meta/) });
	});

	it("rejects wrong methods and unknown paths", async () => {
		const env = { SEARCH_DB: d1(migratedDb()) };
		expect((await call(env, "/health", "POST")).status).toBe(405);
		expect((await call(env, "/indexes/x/docs/search", "GET")).status).toBe(405);
		expect((await call(env, "/indexes/x/docs", "POST")).status).toBe(404);
		expect((await call(env, "/search", "POST")).status).toBe(404);
	});
});
