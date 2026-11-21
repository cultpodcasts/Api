import { applyAdminDocs, CONTENT_KINDS, parseAdminDocsRequest, type AdminDocsOutcome } from "./admin-docs";
import { writeDb } from "./d1-session";
import type { SearchEnv } from "./env";
import { badRequest, d1Unavailable, SearchRequestError } from "./errors";
import { json } from "./health";
import {
	LIVE_TABLES,
	PARKED_TABLES,
	readRebuildState,
	REBUILD_META_KEY,
	RebuildStateUnreadable,
	SHADOW_TABLES,
	type IndexTables,
	type RebuildState
} from "./index-generations";

/**
 * SP-2.3 (cultpodcasts/Api#226): rebuild the whole index into shadow tables and swap it in with one
 * transaction. Driven by the RPP `D1SearchReconcile --rebuild` console (Jon, 21 Nov 2026): the
 * console reads Cosmos with the same rules as the reconcile, loads the shadow, asks for the swap,
 * runs its checks against the new live index, then finishes (drops the parked tables) or swaps back.
 * It is for the rare case a patch can't fix (bad drift, corruption); schema changes stay migrations.
 *
 * Routes (all on the primary, no public ingress; the api Worker's `/search/admin/rebuild/*` with the
 * `write:search-index` M2M token is the only caller):
 * - `GET  /admin/rebuild`: state plus live / shadow / parked counts.
 * - `POST /admin/rebuild/start`: create the shadow tables and their triggers from the live schema.
 * - `POST /admin/rebuild/docs`: `{ rebuildId, upserts }` into the shadow (same validation and
 *   `modifiedAt` guard as `POST /admin/docs`). Meanwhile `POST /admin/docs` writes both generations.
 * - `POST /admin/rebuild/swap`: `{ rebuildId, expectedTotal, expectedKinds?, tolerance?, maxShrink? }`.
 *   Verifies the shadow (counts, FTS row count, FTS structure) and only then swaps, in one batch:
 *   readers see the old index or the new one, never a mix. A failed verification changes nothing.
 * - `POST /admin/rebuild/check`: `{ rebuildId, sampleQueries? }` after the swap: FTS integrity
 *   against the new content table, counts and sample hit counts. Reports; never changes anything.
 * - `POST /admin/rebuild/finish`: drop the parked previous generation.
 * - `POST /admin/rebuild/swap-back`: put the parked generation back (same one-batch swap).
 * - `POST /admin/rebuild/abort`: drop the shadow (while loading, or after a swap-back).
 *
 * The swap renames tables. SQLite rewrites foreign keys and trigger table names on rename, but not
 * an FTS5 `content=` option or the FTS "special column" a trigger names (`INSERT INTO search_fts
 * (search_fts, …)`), so: the shadow FTS table is created with `content='search_docs'` (its name
 * after the swap), and the swap drops every trigger and secondary index and recreates them from
 * the live schema's own SQL. Indexes are built in the swap, not during the load, so they keep their
 * migration names and the load is faster.
 */
export const ADMIN_REBUILD_PATH = "/admin/rebuild";

export const REBUILD_ACTIONS = ["start", "docs", "swap", "check", "finish", "swap-back", "abort"] as const;
export type RebuildAction = (typeof REBUILD_ACTIONS)[number];

/** Log line name (`message = "search: rebuild"` in Workers Observability). */
export const REBUILD_LOG = "search: rebuild";

/** At most this many sample queries per check. */
export const MAX_SAMPLE_QUERIES = 10;
/** Default refusal when the new index is smaller than the live one by more than this share. */
export const DEFAULT_MAX_SHRINK = 0.05;

/** A rebuild request the current state does not allow (409, nothing changed). */
export class RebuildConflict extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RebuildConflict";
	}
}

export type Counts = { total: number; kinds: Record<string, number> };

export type RebuildStatus = {
	state: RebuildState["state"] | "none";
	rebuildId: string | null;
	startedAt: string | null;
	swappedAt: string | null;
	live: Counts;
	shadow: Counts | null;
	parked: Counts | null;
};

export type SwapRequest = {
	rebuildId: string;
	expectedTotal: number;
	expectedKinds?: Record<string, number>;
	tolerance: number;
	maxShrink: number;
};

export type Verification = {
	ok: boolean;
	failures: string[];
	shadow: Counts;
	live: Counts;
	ftsRows: number;
};

export type CheckResult = {
	ok: boolean;
	integrity: { ok: boolean; error?: string };
	counts: Counts;
	samples: { query: string; hits: number }[];
};

export async function adminRebuild(request: Request, env: SearchEnv, action: RebuildAction | null): Promise<Response> {
	const db = writeDb(env);
	let body: Record<string, unknown> = {};
	if (action !== null) {
		try {
			body = parseBody(await request.text());
		} catch (e) {
			return badRequest(e);
		}
	}
	try {
		const result = await run(db, action, body);
		console.log(REBUILD_LOG, { environment: env.searchEnvironment ?? "unknown", action: action ?? "status", ...summary(result) });
		return json(result, 200);
	} catch (e) {
		if (e instanceof SearchRequestError) return badRequest(e);
		if (e instanceof RebuildStateUnreadable) {
			console.error(REBUILD_LOG, { environment: env.searchEnvironment ?? "unknown", action, unreadable: e.message });
			return json({ error: { code: "RebuildStateUnreadable", message: e.message } }, 409);
		}
		if (e instanceof RebuildConflict) {
			console.warn(REBUILD_LOG, { environment: env.searchEnvironment ?? "unknown", action, conflict: e.message });
			return json({ error: { code: "RebuildConflict", message: e.message } }, 409);
		}
		if (e instanceof VerificationFailed) {
			console.warn(REBUILD_LOG, { environment: env.searchEnvironment ?? "unknown", action, failures: e.verification.failures });
			return json({ error: { code: "VerificationFailed", message: e.message }, verification: e.verification }, 409);
		}
		return d1Unavailable(e);
	}
}

class VerificationFailed extends Error {
	constructor(readonly verification: Verification) {
		super(`the new index failed verification; nothing was swapped: ${verification.failures.join("; ")}`);
		this.name = "VerificationFailed";
	}
}

async function run(db: D1Database, action: RebuildAction | null, body: Record<string, unknown>): Promise<unknown> {
	switch (action) {
		case null:
			return status(db);
		case "start":
			allowOnly(body, []);
			return start(db);
		case "docs":
			return loadDocs(db, body);
		case "swap":
			return swap(db, parseSwapRequest(body));
		case "check":
			return check(db, body);
		case "finish":
			allowOnly(body, ["rebuildId"]);
			return finish(db, rebuildIdOf(body));
		case "swap-back":
			allowOnly(body, ["rebuildId"]);
			return swapBack(db, rebuildIdOf(body));
		case "abort":
			allowOnly(body, ["rebuildId"]);
			return abort(db, rebuildIdOf(body));
	}
}

function summary(result: unknown): Record<string, unknown> {
	if (!result || typeof result !== "object") return {};
	const r = result as Record<string, unknown>;
	const keep: Record<string, unknown> = {};
	for (const k of ["rebuildId", "state", "upserted", "ok"]) if (k in r) keep[k] = r[k];
	return keep;
}

// ---------------------------------------------------------------------------------------------
// Actions

export async function status(db: D1Database): Promise<RebuildStatus> {
	const state = await readRebuildState(db);
	const [shadowExists, parkedExists] = await Promise.all([tableExists(db, SHADOW_TABLES.docs), tableExists(db, PARKED_TABLES.docs)]);
	return {
		state: state?.state ?? "none",
		rebuildId: state?.rebuildId ?? null,
		startedAt: state?.startedAt ?? null,
		swappedAt: state?.swappedAt ?? null,
		live: await counts(db, LIVE_TABLES),
		shadow: shadowExists ? await counts(db, SHADOW_TABLES) : null,
		parked: parkedExists ? await counts(db, PARKED_TABLES) : null
	};
}

export async function start(db: D1Database, now: () => Date = () => new Date()): Promise<RebuildState> {
	const current = await readRebuildState(db);
	if (current) {
		throw new RebuildConflict(
			`rebuild ${current.rebuildId} is already ${current.state}: ` +
				(current.state === "swapped" ? "finish or swap it back first" : "abort it first")
		);
	}
	for (const t of [SHADOW_TABLES, PARKED_TABLES]) {
		if (await tableExists(db, t.docs)) throw new RebuildConflict(`${t.docs} exists with no rebuild recorded: drop it by hand first`);
	}
	const schema = await liveSchema(db);
	const state: RebuildState = { rebuildId: crypto.randomUUID(), state: "loading", startedAt: now().toISOString() };
	await db.batch([
		...schema.tables.map((t) => db.prepare(shadowTableSql(t))),
		...schema.triggers.map((t) => db.prepare(generationTriggerSql(t.sql, SHADOW_TABLES))),
		putState(db, state)
	]);
	return state;
}

async function loadDocs(db: D1Database, body: Record<string, unknown>): Promise<AdminDocsOutcome & { rebuildId: string }> {
	allowOnly(body, ["rebuildId", "upserts"]);
	const rebuildId = rebuildIdOf(body);
	const req = parseAdminDocsRequest(JSON.stringify({ upserts: body.upserts }));
	await requireState(db, rebuildId, "loading");
	const outcome = await applyAdminDocs(req, db, [], SHADOW_TABLES);
	return { rebuildId, ...outcome };
}

export async function verify(db: D1Database, req: SwapRequest): Promise<Verification> {
	const [shadow, live, fts] = await Promise.all([
		counts(db, SHADOW_TABLES),
		counts(db, LIVE_TABLES),
		db.prepare(`SELECT count(*) AS n FROM ${SHADOW_TABLES.fts}_docsize`).first<{ n: number }>()
	]);
	const ftsRows = Number(fts?.n ?? 0);
	const failures: string[] = [];
	const within = (actual: number, expected: number) => Math.abs(actual - expected) <= req.tolerance;
	if (!within(shadow.total, req.expectedTotal)) {
		failures.push(`shadow has ${shadow.total} document(s), expected ${req.expectedTotal} (±${req.tolerance})`);
	}
	for (const [kind, expected] of Object.entries(req.expectedKinds ?? {})) {
		const actual = shadow.kinds[kind] ?? 0;
		if (!within(actual, expected)) failures.push(`shadow has ${actual} ${kind}, expected ${expected} (±${req.tolerance})`);
	}
	if (ftsRows !== shadow.total) failures.push(`shadow full-text index has ${ftsRows} row(s) for ${shadow.total} document(s)`);
	if (shadow.total < live.total * (1 - req.maxShrink)) {
		failures.push(
			`shadow (${shadow.total}) is more than ${(req.maxShrink * 100).toFixed(1)}% smaller than the live index (${live.total})`
		);
	}
	if (failures.length === 0) {
		try {
			// Structure only (rank 0): the shadow's content table is named for after the swap, so the
			// content comparison runs in `check`, once it is live.
			await db.prepare(`INSERT INTO ${SHADOW_TABLES.fts} (${SHADOW_TABLES.fts}, rank) VALUES ('integrity-check', 0)`).all();
		} catch (e) {
			failures.push(`shadow full-text index integrity-check failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	return { ok: failures.length === 0, failures, shadow, live, ftsRows };
}

export async function swap(db: D1Database, req: SwapRequest, now: () => Date = () => new Date()) {
	const state = await requireState(db, req.rebuildId, "loading");
	const verification = await verify(db, req);
	if (!verification.ok) throw new VerificationFailed(verification);
	const swapped: RebuildState = { ...state, state: "swapped", swappedAt: now().toISOString() };
	// The parked generation gets its own triggers so `POST /admin/docs` can keep writing it until finish
	// or swap-back (its FTS stays in step with its docs).
	await exchange(db, SHADOW_TABLES, PARKED_TABLES, { parkedTriggers: true }, putState(db, swapped));
	return { ...swapped, verification };
}

export async function check(db: D1Database, body: Record<string, unknown>): Promise<CheckResult & { rebuildId: string }> {
	allowOnly(body, ["rebuildId", "sampleQueries"]);
	const rebuildId = rebuildIdOf(body);
	const queries = parseSampleQueries(body.sampleQueries);
	await requireState(db, rebuildId, "swapped");
	let integrity: CheckResult["integrity"] = { ok: true };
	try {
		await db.prepare(`INSERT INTO ${LIVE_TABLES.fts} (${LIVE_TABLES.fts}, rank) VALUES ('integrity-check', 1)`).all();
	} catch (e) {
		integrity = { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 500) };
	}
	const samples: CheckResult["samples"] = [];
	for (const query of queries) {
		const row = await db
			.prepare(`SELECT count(*) AS n FROM ${LIVE_TABLES.fts} WHERE ${LIVE_TABLES.fts} MATCH ?`)
			.bind(phrase(query))
			.first<{ n: number }>();
		samples.push({ query, hits: Number(row?.n ?? 0) });
	}
	const result = { integrity, counts: await counts(db, LIVE_TABLES), samples };
	return { rebuildId, ok: integrity.ok && samples.every((s) => s.hits > 0), ...result };
}

export async function finish(db: D1Database, rebuildId: string) {
	await requireState(db, rebuildId, "swapped");
	await db.batch([...dropGeneration(db, PARKED_TABLES), clearState(db)]);
	return { rebuildId, state: "finished" as const };
}

export async function swapBack(db: D1Database, rebuildId: string) {
	const state = await requireState(db, rebuildId, "swapped");
	const back: RebuildState = { ...state, state: "swappedBack" };
	await exchange(db, PARKED_TABLES, SHADOW_TABLES, { parkedTriggers: false }, putState(db, back));
	return back;
}

export async function abort(db: D1Database, rebuildId: string) {
	const state = await readRebuildState(db);
	if (!state || state.rebuildId !== rebuildId) throw new RebuildConflict(`rebuild ${rebuildId} is not in progress`);
	if (state.state === "swapped") throw new RebuildConflict(`rebuild ${rebuildId} is live: swap it back or finish it`);
	const triggers = state.state === "loading" ? (await liveSchema(db)).triggers.map((t) => generationName(t.name, SHADOW_TABLES)) : [];
	await db.batch([
		...triggers.map((name) => db.prepare(`DROP TRIGGER IF EXISTS ${quote(name)}`)),
		...dropGeneration(db, SHADOW_TABLES),
		clearState(db)
	]);
	return { rebuildId, state: "aborted" as const };
}

// ---------------------------------------------------------------------------------------------
// The swap

type SchemaObject = { type: "table" | "index" | "trigger"; name: string; tbl_name: string; sql: string };
type LiveSchema = { tables: SchemaObject[]; indexes: SchemaObject[]; triggers: SchemaObject[] };

const LIVE_NAMES = [LIVE_TABLES.docs, LIVE_TABLES.subjects, LIVE_TABLES.fts];

/** The live generation's tables, secondary indexes and triggers, as the migrations left them. */
export async function liveSchema(db: D1Database): Promise<LiveSchema> {
	const { results } = await db
		.prepare(
			"SELECT type, name, tbl_name, sql FROM sqlite_master WHERE tbl_name IN (?1, ?2, ?3) AND sql IS NOT NULL " +
				"AND type IN ('table', 'index', 'trigger') ORDER BY type, name"
		)
		.bind(...LIVE_NAMES)
		.all<SchemaObject>();
	const byOrder = (a: SchemaObject, b: SchemaObject) => LIVE_NAMES.indexOf(a.name) - LIVE_NAMES.indexOf(b.name);
	return {
		// Parent before child (doc_subjects references search_docs), the FTS table last.
		tables: results.filter((r) => r.type === "table").sort(byOrder),
		indexes: results.filter((r) => r.type === "index"),
		triggers: results.filter((r) => r.type === "trigger")
	};
}

/**
 * One transaction: drop the live generation's triggers and secondary indexes (and any triggers the
 * incoming generation had under its own suffix), park it under `park`'s names, rename `incoming` to
 * the live names, then recreate the indexes and triggers from the live schema's own SQL, so the new
 * live tables look exactly as the migrations made them. With `parkedTriggers`, the parked generation
 * also gets the live triggers under its suffix, so writes can keep reaching it.
 *
 * Recreating the secondary indexes builds them over the whole incoming generation inside this batch
 * (five `CREATE INDEX` on ~92k rows in production). Each is a separate statement well inside D1's
 * per-statement limit locally; a timeout rolls the whole batch back (503, state unchanged). Prove the
 * timing on preview before the first production rebuild (README).
 */
async function exchange(
	db: D1Database,
	incoming: IndexTables,
	park: IndexTables,
	options: { parkedTriggers: boolean },
	stateStatement: D1PreparedStatement
): Promise<void> {
	const schema = await liveSchema(db);
	const keys = ["docs", "subjects", "fts"] as const;
	await db.batch([
		...schema.triggers.map((t) => db.prepare(`DROP TRIGGER ${quote(t.name)}`)),
		...schema.triggers.map((t) => db.prepare(`DROP TRIGGER IF EXISTS ${quote(generationName(t.name, incoming))}`)),
		...schema.indexes.map((i) => db.prepare(`DROP INDEX ${quote(i.name)}`)),
		...keys.map((k) => db.prepare(`ALTER TABLE ${LIVE_TABLES[k]} RENAME TO ${park[k]}`)),
		...keys.map((k) => db.prepare(`ALTER TABLE ${incoming[k]} RENAME TO ${LIVE_TABLES[k]}`)),
		...schema.indexes.map((i) => db.prepare(i.sql)),
		...schema.triggers.map((t) => db.prepare(t.sql)),
		...(options.parkedTriggers ? schema.triggers.map((t) => db.prepare(generationTriggerSql(t.sql, park))) : []),
		stateStatement
	]);
}

function dropGeneration(db: D1Database, t: IndexTables): D1PreparedStatement[] {
	// Child before parent; dropping the FTS table drops its own shadow tables.
	return [t.subjects, t.docs, t.fts].map((name) => db.prepare(`DROP TABLE IF EXISTS ${name}`));
}

/** A live object's name in another generation (`search_docs_ai` → `search_docs_ai_new`). */
function generationName(name: string, t: IndexTables): string {
	return `${name}${t.docs.slice(LIVE_TABLES.docs.length)}`;
}

function shadowName(name: string): string {
	return generationName(name, SHADOW_TABLES);
}

/** An identifier, optionally quoted as SQLite stores it after a rename (`"search_docs"`). */
function nameRe(name: string): string {
	return `(?:"${name}"|\`${name}\`|\\[${name}\\]|\\b${name}\\b)`;
}

/**
 * The shadow copy of a live table's CREATE statement. Only the table's own name changes, plus the
 * `doc_subjects` foreign key; the FTS table keeps `content='search_docs'`, the name its content
 * table will have once swapped in.
 */
export function shadowTableSql(table: SchemaObject): string {
	const target = shadowName(table.name);
	const header = new RegExp(`^(CREATE\\s+(?:VIRTUAL\\s+)?TABLE\\s+)${nameRe(table.name)}`, "i");
	if (!header.test(table.sql)) throw new Error(`unexpected CREATE statement for ${table.name}`);
	let sql = table.sql.replace(header, `$1${target}`);
	if (table.name === LIVE_TABLES.subjects) {
		sql = sql.replace(new RegExp(`(REFERENCES\\s+)${nameRe(LIVE_TABLES.docs)}`, "gi"), `$1${SHADOW_TABLES.docs}`);
	}
	return sql;
}

/** The shadow copy of a live trigger: its name, its table and every table it writes, suffixed. */
export function shadowTriggerSql(sql: string): string {
	return generationTriggerSql(sql, SHADOW_TABLES);
}

/** A live trigger for another generation (`_new` while loading, `_old` while parked). */
export function generationTriggerSql(sql: string, t: IndexTables): string {
	const named = sql.replace(
		/^(CREATE\s+TRIGGER\s+)("?)(\w+)\2/i,
		(_m, head: string, _q: string, name: string) => `${head}${generationName(name, t)}`
	);
	return [LIVE_TABLES.docs, LIVE_TABLES.fts].reduce(
		(s, name) => s.replace(new RegExp(nameRe(name), "g"), generationName(name, t)),
		named
	);
}

// ---------------------------------------------------------------------------------------------
// Helpers

async function counts(db: D1Database, t: IndexTables): Promise<Counts> {
	const { results } = await db.prepare(`SELECT kind, count(*) AS n FROM ${t.docs} GROUP BY kind`).all<{ kind: string; n: number }>();
	const kinds: Record<string, number> = {};
	let total = 0;
	for (const r of results) {
		kinds[r.kind] = Number(r.n);
		total += Number(r.n);
	}
	return { total, kinds };
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
	const row = await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?").bind(name).first();
	return row !== null;
}

async function requireState(db: D1Database, rebuildId: string, phase: RebuildState["state"]): Promise<RebuildState> {
	const state = await readRebuildState(db);
	if (!state) throw new RebuildConflict("no rebuild is in progress");
	if (state.rebuildId !== rebuildId) throw new RebuildConflict(`rebuild ${rebuildId} is not the one in progress (${state.rebuildId})`);
	if (state.state !== phase) throw new RebuildConflict(`rebuild ${rebuildId} is ${state.state}, not ${phase}`);
	return state;
}

function putState(db: D1Database, state: RebuildState): D1PreparedStatement {
	return db
		.prepare("INSERT INTO search_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
		.bind(REBUILD_META_KEY, JSON.stringify(state));
}

function clearState(db: D1Database): D1PreparedStatement {
	return db.prepare("DELETE FROM search_meta WHERE key = ?").bind(REBUILD_META_KEY);
}

function quote(name: string): string {
	return `"${name.replace(/"/g, '""')}"`;
}

/** A sample query as one FTS5 phrase, so user text can't be FTS syntax. */
function phrase(query: string): string {
	return `"${query.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------------------------
// Parsing (400 before anything is touched)

function parseBody(raw: string): Record<string, unknown> {
	if (!raw.trim()) return {};
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		throw new SearchRequestError("request body is not valid JSON");
	}
	if (body === null || typeof body !== "object" || Array.isArray(body)) throw new SearchRequestError("request body must be a JSON object");
	return body as Record<string, unknown>;
}

function allowOnly(body: Record<string, unknown>, keys: string[]): void {
	for (const key of Object.keys(body)) if (!keys.includes(key)) throw new SearchRequestError(`unknown field '${key}'`);
}

function rebuildIdOf(body: Record<string, unknown>): string {
	const id = body.rebuildId;
	if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new SearchRequestError("rebuildId must be the id start returned");
	return id;
}

function nonNegativeInteger(value: unknown, name: string): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		throw new SearchRequestError(`${name} must be a non-negative integer`);
	}
	return value;
}

export function parseSwapRequest(body: Record<string, unknown>): SwapRequest {
	allowOnly(body, ["rebuildId", "expectedTotal", "expectedKinds", "tolerance", "maxShrink"]);
	const req: SwapRequest = {
		rebuildId: rebuildIdOf(body),
		expectedTotal: nonNegativeInteger(body.expectedTotal, "expectedTotal"),
		tolerance: body.tolerance === undefined ? 0 : nonNegativeInteger(body.tolerance, "tolerance"),
		maxShrink: DEFAULT_MAX_SHRINK
	};
	if (body.maxShrink !== undefined) {
		const m = body.maxShrink;
		if (typeof m !== "number" || !Number.isFinite(m) || m < 0 || m > 1) throw new SearchRequestError("maxShrink must be a number from 0 to 1");
		req.maxShrink = m;
	}
	if (body.expectedKinds !== undefined) {
		const kinds = body.expectedKinds;
		if (kinds === null || typeof kinds !== "object" || Array.isArray(kinds)) throw new SearchRequestError("expectedKinds must be an object");
		req.expectedKinds = {};
		for (const [kind, n] of Object.entries(kinds)) {
			if (!CONTENT_KINDS.includes(kind as (typeof CONTENT_KINDS)[number])) {
				throw new SearchRequestError(`expectedKinds: unknown kind '${kind}' (${CONTENT_KINDS.join(", ")})`);
			}
			req.expectedKinds[kind] = nonNegativeInteger(n, `expectedKinds.${kind}`);
		}
	}
	return req;
}

function parseSampleQueries(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value) || !value.every((q) => typeof q === "string" && q.trim() && q.length <= 200)) {
		throw new SearchRequestError("sampleQueries must be an array of non-empty strings (at most 200 characters)");
	}
	if (value.length > MAX_SAMPLE_QUERIES) throw new SearchRequestError(`at most ${MAX_SAMPLE_QUERIES} sampleQueries`);
	return value as string[];
}

/** `/admin/rebuild` → status (null), `/admin/rebuild/{action}` → the action, anything else → undefined. */
export function rebuildAction(pathname: string): RebuildAction | null | undefined {
	if (pathname === ADMIN_REBUILD_PATH) return null;
	const prefix = `${ADMIN_REBUILD_PATH}/`;
	if (!pathname.startsWith(prefix)) return undefined;
	const action = pathname.slice(prefix.length);
	return (REBUILD_ACTIONS as readonly string[]).includes(action) ? (action as RebuildAction) : undefined;
}
