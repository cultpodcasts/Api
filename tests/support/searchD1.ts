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

/** D1 rejects a statement with more than 100 bound parameters; the adapter does too. */
export const D1_MAX_BOUND_PARAMETERS = 100;

/** What the adapter saw: the session constraints opened and any reads that bypassed a session. */
export type D1Spy = {
	/** `withSession` arguments, in call order (SP-1.2: one `first-unconstrained` per request). */
	sessions: (string | undefined)[];
	/** Statements prepared on the database itself instead of a session (always on the primary in D1). */
	directPrepares: string[];
};

export type D1AdapterOptions = {
	/** `meta` every result carries, e.g. `{ served_by_region: "ENAM", served_by_primary: false }`. */
	meta?: Partial<D1Meta>;
	spy?: D1Spy;
};

export function d1Spy(): D1Spy {
	return { sessions: [], directPrepares: [] };
}

/**
 * Minimal D1Database over node:sqlite: prepare().bind() with first(), all(), batch() (one transaction) and
 * withSession() (a session runs on the same database; `getBookmark` returns a fixed token).
 * Enforces D1's 100-bound-parameter limit, which node:sqlite would otherwise allow.
 */
export function d1(db: DatabaseSync, options: D1AdapterOptions = {}): D1Database {
	const meta = { ...(options.meta ?? {}) };
	const statement = (sql: string) => {
		let params: unknown[] = [];
		const stmt = {
			bind(...values: unknown[]) {
				if (values.length > D1_MAX_BOUND_PARAMETERS) {
					throw new Error(`D1_ERROR: too many SQL variables (${values.length} > ${D1_MAX_BOUND_PARAMETERS})`);
				}
				params = values;
				return stmt;
			},
			async first<T>() {
				return (db.prepare(sql).get(...(params as never[])) ?? null) as T | null;
			},
			async all<T>() {
				return { results: db.prepare(sql).all(...(params as never[])) as T[], success: true, meta: { ...meta } };
			}
		};
		return stmt;
	};
	// D1 runs a batch as one transaction: every statement lands or none does.
	const batch = async (statements: { all(): Promise<unknown> }[]) => {
		db.exec("BEGIN");
		try {
			const results: unknown[] = [];
			for (const s of statements) results.push(await s.all());
			db.exec("COMMIT");
			return results;
		} catch (e) {
			db.exec("ROLLBACK");
			throw e;
		}
	};
	return {
		prepare(sql: string) {
			options.spy?.directPrepares.push(sql);
			return statement(sql);
		},
		batch,
		withSession(constraintOrBookmark?: string) {
			options.spy?.sessions.push(constraintOrBookmark);
			return { prepare: statement, batch, getBookmark: () => "test-bookmark" };
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
