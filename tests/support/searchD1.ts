import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Search D1 test helpers: the SP-1.1 schema in node:sqlite behind a minimal D1Database. */

export const searchMigrationsDir = resolve(process.cwd(), "workers/search/migrations");

/** Migration files in apply order (wrangler applies them by name). */
export function searchMigrationFiles(): string[] {
	return readdirSync(searchMigrationsDir)
		.filter((f) => f.endsWith(".sql"))
		.sort();
}

/** In-memory database with every search migration applied. */
export function migratedSearchDb(): DatabaseSync {
	const db = new DatabaseSync(":memory:");
	db.exec("PRAGMA foreign_keys = ON;");
	for (const file of searchMigrationFiles()) {
		db.exec(readFileSync(resolve(searchMigrationsDir, file), "utf8"));
	}
	return db;
}

/** Minimal D1Database over node:sqlite: prepare().bind() with first(), all(), and batch(). */
export function d1(db: DatabaseSync): D1Database {
	const statement = (sql: string) => {
		let params: unknown[] = [];
		const stmt = {
			bind(...values: unknown[]) {
				params = values;
				return stmt;
			},
			async first<T>() {
				return (db.prepare(sql).get(...(params as never[])) ?? null) as T | null;
			},
			async all<T>() {
				return { results: db.prepare(sql).all(...(params as never[])) as T[], success: true, meta: {} };
			}
		};
		return stmt;
	};
	return {
		prepare: statement,
		async batch(statements: { all(): Promise<unknown> }[]) {
			return Promise.all(statements.map((s) => s.all()));
		}
	} as unknown as D1Database;
}

/** Upsert per the write contract: INSERT … ON CONFLICT(id) DO UPDATE, never INSERT OR REPLACE. */
export function upsertSearchDoc(db: DatabaseSync, doc: Record<string, unknown>, subjects: string[] = []): number {
	const row: Record<string, unknown> = {
		kind: "Episode",
		release: "2026-11-01T00:00:00Z",
		duration: "01:00:00",
		...doc,
		...(subjects.length && doc.subjects_text === undefined ? { subjects_text: subjects.join("\n") } : {})
	};
	const cols = Object.keys(row);
	const updates = cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`);
	db.prepare(
		`INSERT INTO search_docs (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${updates.join(", ")}`
	).run(...(Object.values(row) as never[]));
	const { rowid } = db.prepare("SELECT rowid FROM search_docs WHERE id = ?").get(row.id as string) as { rowid: number };
	db.prepare("DELETE FROM doc_subjects WHERE rowid_ref = ?").run(rowid);
	for (const subject of subjects) {
		db.prepare("INSERT INTO doc_subjects (rowid_ref, subject) VALUES (?, ?)").run(rowid, subject);
	}
	return rowid;
}
