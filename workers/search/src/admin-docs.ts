import { requestIdFromRequest, SearchWorkerRoute, writeDb } from "./d1-session";
import type { SearchEnv } from "./env";
import { badRequest, d1Unavailable, SearchRequestError } from "./errors";
import { json } from "./health";
import { alsoWriteTo, LIVE_TABLES, PARKED_TABLES, readRebuildState, RebuildStateUnreadable, SHADOW_TABLES, type IndexTables } from "./index-generations";

/**
 * `POST /admin/docs`: the search index write path (SP-1.4, cultpodcasts/Api#222).
 *
 * Body `{ upserts: SearchDocUpsert[], deletes: string[] }`. Everything in one request is applied
 * as one D1 `batch()`, which is a single transaction on the primary: all of it lands or none of
 * it does. The FTS5 external-content triggers keep `search_fts` in step (upserts use
 * `INSERT … ON CONFLICT(id) DO UPDATE`, never REPLACE; see the migration's write contract).
 *
 * **Stale-replay guard.** Every upsert carries `modifiedAt` (epoch ms of the source change). An
 * upsert older than the stored row is dropped and reported in `stale`, so a retried or reordered
 * push can never overwrite a newer document. An equal `modifiedAt` applies (an idempotent replay).
 *
 * **Auth.** The search Worker has no public ingress (`workers_dev` and preview URLs off, no
 * routes; wrangler.search.jsonc), so only Workers holding its service binding can call this route.
 * The api Worker's `POST /search/admin/docs` is the only caller: it requires an Auth0 M2M token
 * with `write:search-index` and forwards the body here (`src/searchAdminDocs.ts`).
 *
 * Response (a command outcome, CQRS): `200 { upserted, deleted, stale: [id], notFound: [id] }`.
 * A bad body is 400 (nothing written); a D1 failure is 503 (nothing written, safe to retry).
 */
export const ADMIN_DOCS_PATH = "/admin/docs";

/** Per request. Pushes are tens per hour; the weekly reconcile (SP-2.2) pages through these. */
export const MAX_UPSERTS = 100;
export const MAX_DELETES = 1000;
/** Whole body. 100 documents with full descriptions sit well inside this. */
export const MAX_ADMIN_BODY_LENGTH = 16 * 1024 * 1024;
/**
 * One document, as stored (UTF-8 bytes of its JSON). D1 caps a row and a bound string at 2 MB;
 * upserts bind as one JSON parameter per chunk, so a chunk stays at or under this size.
 */
export const MAX_DOC_BYTES = 1_000_000;

export const CONTENT_KINDS = ["Episode", "TvShowEpisode", "Film", "NewsReport"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/**
 * One document to index: the Azure document (`EpisodeSearchRecord`, camelCase, the keys
 * docs/search returns) plus the searchable-only fields and `modifiedAt`.
 */
export type SearchDocUpsert = {
	id: string;
	/** Absent or null is a podcast Episode (older Azure documents carry no contentKind). */
	contentKind?: ContentKind | null;
	title?: string | null;
	seriesName?: string | null;
	/** Full description, never truncated (SP-0.3). */
	description?: string | null;
	/** Any ISO-8601 date-time; stored as UTC `yyyy-MM-ddTHH:mm:ssZ` (the Azure shape). */
	release: string;
	/** .NET TimeSpan string, as Azure stores it. */
	duration: string;
	spotifyId?: string | null;
	appleId?: string | null;
	podcastAppleId?: string | null;
	youtubeId?: string | null;
	bbc?: string | null;
	internetArchive?: string | null;
	svc?: string | null;
	subjects?: string[] | null;
	image?: string | null;
	/** `{duration}|{url}|{title}` tokens. */
	trailers?: string[] | null;
	/** `{youTubeId}|{release}|{channelName}` tokens (RPP #1411). Retrievable, not searchable. */
	youTubeAlternates?: string[] | null;
	/** Film AKAs: searchable and returned. */
	alternativeTitles?: string[] | null;
	imdbId?: string | null;
	tmdbId?: number | null;
	tvdbId?: number | null;
	seriesImdbId?: string | null;
	seriesTmdbId?: number | null;
	seriesTvdbId?: number | null;
	/** NULL means English, as in Azure. */
	lang?: string | null;
	/** Searchable, never returned. */
	guests?: string[] | null;
	publisherSearchTerms?: string | null;
	episodeSearchTerms?: string | null;
	/** Source modification time, epoch milliseconds: the stale-replay guard. */
	modifiedAt: number;
};

export type AdminDocsRequest = { upserts: SearchDocUpsert[]; deletes: string[] };

export type AdminDocsOutcome = {
	/** Upserts written (inserted or updated). */
	upserted: number;
	/** Deletes that removed a document. */
	deleted: number;
	/** Upserts dropped because the stored document has a newer `modifiedAt`. */
	stale: string[];
	/** Deletes for ids the index did not have (already gone: not an error). */
	notFound: string[];
};

/** A `search_docs` row as the upsert SQL reads it from JSON (`json_extract(value, '$.<column>')`). */
type DocRow = {
	id: string;
	kind: ContentKind;
	title: string | null;
	series_name: string | null;
	description: string | null;
	guests: string | null;
	alternative_titles: string | null;
	subjects_text: string | null;
	publisher_search_terms: string | null;
	episode_search_terms: string | null;
	release: string;
	duration: string;
	lang: string | null;
	spotify_id: string | null;
	apple_id: string | null;
	podcast_apple_id: string | null;
	youtube_id: string | null;
	bbc: string;
	internet_archive: string;
	svc: string;
	image: string | null;
	trailers: string | null;
	youtube_alternates: string | null;
	imdb_id: string | null;
	tmdb_id: number | null;
	tvdb_id: number | null;
	series_imdb_id: string | null;
	series_tmdb_id: number | null;
	series_tvdb_id: number | null;
	modified_at: number;
};

/** Every `search_docs` column the write path sets (all but `rowid`), in schema order. */
const ROW_COLUMNS = [
	"id",
	"kind",
	"title",
	"series_name",
	"description",
	"guests",
	"alternative_titles",
	"subjects_text",
	"publisher_search_terms",
	"episode_search_terms",
	"release",
	"duration",
	"lang",
	"spotify_id",
	"apple_id",
	"podcast_apple_id",
	"youtube_id",
	"bbc",
	"internet_archive",
	"svc",
	"image",
	"trailers",
	"youtube_alternates",
	"imdb_id",
	"tmdb_id",
	"tvdb_id",
	"series_imdb_id",
	"series_tmdb_id",
	"series_tvdb_id",
	"modified_at"
] as const satisfies readonly (keyof DocRow)[];

/** Write SQL for one generation of the index. */
export type WriteSql = { upsert: string; subjectsClear: string; subjectsInsert: string; delete: string };

/**
 * Upsert a chunk of documents bound as one JSON array (D1 allows 100 bound parameters, so rows
 * cannot bind column by column). `WHERE true` resolves SQLite's INSERT…SELECT…ON CONFLICT parse
 * ambiguity. The DO UPDATE `WHERE` is the stale-replay guard; RETURNING lists the rows written.
 * The SET list names all eight FTS columns, so the AFTER UPDATE OF trigger rewrites the FTS row on
 * every applied upsert, even when the text is unchanged: callers should push only new or changed
 * documents.
 *
 * Subject rows follow the document, but only for upserts the guard let through: the joined row
 * must now carry this upsert's `modified_at`. A stale upsert leaves the stored subjects alone.
 * A delete cascades to the subjects and the delete trigger removes the FTS row.
 */
export function writeSql(t: IndexTables): WriteSql {
	const applied =
		`FROM json_each(?) j JOIN ${t.docs} d ON d.id = json_extract(j.value, '$.id') ` +
		"AND d.modified_at = json_extract(j.value, '$.modified_at')";
	return {
		upsert:
			`INSERT INTO ${t.docs} (${ROW_COLUMNS.join(", ")}) ` +
			`SELECT ${ROW_COLUMNS.map((c) => `json_extract(j.value, '$.${c}')`).join(", ")} FROM json_each(?) j WHERE true ` +
			`ON CONFLICT(id) DO UPDATE SET ${ROW_COLUMNS.filter((c) => c !== "id")
				.map((c) => `${c} = excluded.${c}`)
				.join(", ")} ` +
			`WHERE excluded.modified_at >= ${t.docs}.modified_at RETURNING id`,
		subjectsClear: `DELETE FROM ${t.subjects} WHERE rowid_ref IN (SELECT d.rowid ${applied})`,
		subjectsInsert: `INSERT INTO ${t.subjects} (rowid_ref, subject) SELECT d.rowid, s.value ${applied} JOIN json_each(j.value, '$.subjects') s`,
		delete: `DELETE FROM ${t.docs} WHERE id IN (SELECT value FROM json_each(?)) RETURNING id`
	};
}

const LIVE_SQL = writeSql(LIVE_TABLES);

export async function adminDocs(request: Request, env: SearchEnv): Promise<Response> {
	let req: AdminDocsRequest;
	try {
		req = parseAdminDocsRequest(await request.text());
	} catch (e) {
		return badRequest(e, { requestId: requestIdFromRequest(request), route: SearchWorkerRoute.AdminDocs });
	}
	try {
		const db = writeDb(env);
		// SP-2.3: while a rebuild is loading, every write also lands in the shadow tables (same
		// transaction), so the swap never loses a push made during the load. After the swap, until
		// finish or swap-back, it also lands in the parked previous generation, so a swap-back
		// restores an index that missed nothing. An unreadable rebuild state refuses the write.
		const also = alsoWriteTo(await readRebuildState(db));
		const outcome = await applyAdminDocs(req, db, also);
		console.log(ADMIN_WRITE_LOG, {
			environment: env.searchEnvironment ?? "unknown",
			upserted: outcome.upserted,
			deleted: outcome.deleted,
			stale: outcome.stale.length,
			notFound: outcome.notFound.length,
			...(also.includes(SHADOW_TABLES) ? { alsoShadow: true } : {}),
			...(also.includes(PARKED_TABLES) ? { alsoParked: true } : {})
		});
		return json(outcome, 200);
	} catch (e) {
		if (e instanceof RebuildStateUnreadable) {
			console.error(ADMIN_WRITE_LOG, { environment: env.searchEnvironment ?? "unknown", refused: e.message });
			return json({ error: { code: "RebuildStateUnreadable", message: e.message } }, 503);
		}
		return d1Unavailable(e, { requestId: requestIdFromRequest(request), route: SearchWorkerRoute.AdminDocs });
	}
}

/** Log line name; filter on it in Workers Observability (`message = "search: admin write"`). */
export const ADMIN_WRITE_LOG = "search: admin write";

/** The statements that apply a parsed request to one generation of the index. */
export function writeStatements(
	req: AdminDocsRequest,
	db: D1Database,
	sql: WriteSql
): { statements: D1PreparedStatement[]; deleteAt: number | null; upsertsAt: number[] } {
	const items = req.upserts.map((doc) => ({ row: toDocRow(doc), subjects: subjectsOf(doc) }));
	const statements: D1PreparedStatement[] = [];
	let deleteAt: number | null = null;
	if (req.deletes.length) {
		deleteAt = statements.length;
		statements.push(db.prepare(sql.delete).bind(JSON.stringify(req.deletes)));
	}
	const upsertsAt: number[] = [];
	for (const chunk of chunkBySize(items)) {
		upsertsAt.push(statements.length);
		statements.push(db.prepare(sql.upsert).bind(JSON.stringify(chunk.map((c) => c.row))));
		const subjects = JSON.stringify(chunk.map((c) => ({ id: c.row.id, modified_at: c.row.modified_at, subjects: c.subjects })));
		statements.push(db.prepare(sql.subjectsClear).bind(subjects));
		statements.push(db.prepare(sql.subjectsInsert).bind(subjects));
	}
	return { statements, deleteAt, upsertsAt };
}

/**
 * Applies a parsed request in one transaction and reports what happened to each id in the first
 * generation written (the live index, or the shadow for a rebuild load). `alsoTo` generations get the
 * same writes in the same batch (SP-2.3 dual write); their outcome is not reported.
 */
export async function applyAdminDocs(
	req: AdminDocsRequest,
	db: D1Database,
	alsoTo: IndexTables[] = [],
	tables: IndexTables = LIVE_TABLES
): Promise<AdminDocsOutcome> {
	const primary = writeStatements(req, db, tables === LIVE_TABLES ? LIVE_SQL : writeSql(tables));
	const statements = [...primary.statements, ...alsoTo.flatMap((t) => writeStatements(req, db, writeSql(t)).statements)];
	const results = await db.batch<{ id: string }>(statements);
	const deleted = new Set(primary.deleteAt === null ? [] : results[primary.deleteAt].results.map((r) => r.id));
	const written = new Set(primary.upsertsAt.flatMap((i) => results[i].results.map((r) => r.id)));
	return {
		upserted: written.size,
		deleted: deleted.size,
		stale: req.upserts.map((d) => d.id).filter((id) => !written.has(id)),
		notFound: req.deletes.filter((id) => !deleted.has(id))
	};
}

const encoder = new TextEncoder();

/** Groups upserts so each chunk's row JSON stays within {@link MAX_DOC_BYTES} (one row always fits: parse checked it). */
function chunkBySize<T extends { row: DocRow }>(items: T[]): T[][] {
	const chunks: T[][] = [];
	let current: T[] = [];
	let size = 2;
	for (const item of items) {
		const bytes = encoder.encode(JSON.stringify(item.row)).length + 1;
		if (current.length && size + bytes > MAX_DOC_BYTES) {
			chunks.push(current);
			current = [];
			size = 2;
		}
		current.push(item);
		size += bytes;
	}
	if (current.length) chunks.push(current);
	return chunks;
}

/** Distinct, trimmed, non-blank subjects (doc_subjects has one row per subject). */
function subjectsOf(doc: SearchDocUpsert): string[] {
	return [...new Set((doc.subjects ?? []).map((s) => s.trim()).filter(Boolean))];
}

// ---------------------------------------------------------------------------------------------
// Request parsing: every check that can fail happens here, before anything is written.

const STRING_FIELDS = [
	"title",
	"seriesName",
	"description",
	"spotifyId",
	"appleId",
	"podcastAppleId",
	"youtubeId",
	"bbc",
	"internetArchive",
	"svc",
	"image",
	"imdbId",
	"seriesImdbId",
	"lang",
	"publisherSearchTerms",
	"episodeSearchTerms"
] as const;
const STRING_LIST_FIELDS = ["subjects", "trailers", "youTubeAlternates", "alternativeTitles", "guests"] as const;
const INTEGER_FIELDS = ["tmdbId", "tvdbId", "seriesTmdbId", "seriesTvdbId"] as const;
/** On `EpisodeSearchRecord` but `[FieldBuilderIgnore]` (not on the live index): accepted and dropped. */
const IGNORED_LEGACY_FIELDS = ["podcastName", "episodeTitle", "episodeDescription"] as const;

const KNOWN_FIELDS = new Set<string>([
	"id",
	"contentKind",
	"release",
	"duration",
	"modifiedAt",
	...STRING_FIELDS,
	...STRING_LIST_FIELDS,
	...INTEGER_FIELDS,
	...IGNORED_LEGACY_FIELDS
]);

export function parseAdminDocsRequest(raw: string): AdminDocsRequest {
	if (raw.length > MAX_ADMIN_BODY_LENGTH) {
		throw new SearchRequestError(`request body is too large (at most ${MAX_ADMIN_BODY_LENGTH} characters)`);
	}
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		throw new SearchRequestError("request body is not valid JSON");
	}
	if (!isObject(body)) throw new SearchRequestError("request body must be a JSON object");
	for (const key of Object.keys(body)) {
		if (key !== "upserts" && key !== "deletes") throw new SearchRequestError(`unknown field '${key}'`);
	}
	const upserts = optionalArray(body.upserts, "upserts");
	const deletes = optionalArray(body.deletes, "deletes");
	if (!upserts.length && !deletes.length) throw new SearchRequestError("upserts and deletes are both empty");
	if (upserts.length > MAX_UPSERTS) throw new SearchRequestError(`at most ${MAX_UPSERTS} upserts per request`);
	if (deletes.length > MAX_DELETES) throw new SearchRequestError(`at most ${MAX_DELETES} deletes per request`);

	const docs = upserts.map((doc, i) => parseUpsert(doc, `upserts[${i}]`));
	const deleteIds = deletes.map((id, i) => parseId(id, `deletes[${i}]`));
	const seen = new Set<string>();
	for (const id of [...docs.map((d) => d.id), ...deleteIds]) {
		// One operation per id per request: "upsert then delete" (or two upserts) has no defined order.
		if (seen.has(id)) throw new SearchRequestError(`id '${id}' appears more than once`);
		seen.add(id);
	}
	return { upserts: docs, deletes: deleteIds };
}

function parseUpsert(value: unknown, at: string): SearchDocUpsert {
	if (!isObject(value)) throw new SearchRequestError(`${at} must be an object`);
	for (const key of Object.keys(value)) {
		if (!KNOWN_FIELDS.has(key)) throw new SearchRequestError(`${at}: unknown field '${key}'`);
	}
	const doc: SearchDocUpsert = {
		id: parseId(value.id, `${at}.id`),
		release: parseRelease(value.release, `${at}.release`),
		duration: requiredString(value.duration, `${at}.duration`),
		modifiedAt: parseModifiedAt(value.modifiedAt, `${at}.modifiedAt`)
	};
	const kind = value.contentKind;
	if (kind !== undefined && kind !== null) {
		if (!CONTENT_KINDS.includes(kind as ContentKind)) {
			throw new SearchRequestError(`${at}.contentKind must be one of ${CONTENT_KINDS.join(", ")}`);
		}
		doc.contentKind = kind as ContentKind;
	}
	for (const f of STRING_FIELDS) {
		const v = value[f];
		if (v !== undefined && v !== null && typeof v !== "string") throw new SearchRequestError(`${at}.${f} must be a string`);
		if (typeof v === "string") doc[f] = v;
	}
	for (const f of STRING_LIST_FIELDS) {
		const v = value[f];
		if (v === undefined || v === null) continue;
		if (!Array.isArray(v) || !v.every((s) => typeof s === "string")) {
			throw new SearchRequestError(`${at}.${f} must be an array of strings`);
		}
		doc[f] = v;
	}
	for (const f of INTEGER_FIELDS) {
		const v = value[f];
		if (v === undefined || v === null) continue;
		if (typeof v !== "number" || !Number.isSafeInteger(v)) throw new SearchRequestError(`${at}.${f} must be an integer`);
		doc[f] = v;
	}
	if (encoder.encode(JSON.stringify(toDocRow(doc))).length > MAX_DOC_BYTES) {
		throw new SearchRequestError(`${at} is too large (at most ${MAX_DOC_BYTES} bytes stored)`);
	}
	return doc;
}

/** The stored row. Lists become newline-separated text, the shape the read path splits. */
export function toDocRow(doc: SearchDocUpsert): DocRow {
	const subjects = subjectsOf(doc);
	return {
		id: doc.id,
		kind: doc.contentKind ?? "Episode",
		title: doc.title ?? null,
		series_name: doc.seriesName ?? null,
		description: doc.description ?? null,
		guests: lines(doc.guests),
		alternative_titles: lines(doc.alternativeTitles),
		subjects_text: subjects.length ? subjects.join("\n") : null,
		publisher_search_terms: doc.publisherSearchTerms ?? null,
		episode_search_terms: doc.episodeSearchTerms ?? null,
		release: doc.release,
		duration: doc.duration,
		lang: doc.lang ?? null,
		spotify_id: doc.spotifyId ?? null,
		apple_id: doc.appleId ?? null,
		podcast_apple_id: doc.podcastAppleId ?? null,
		youtube_id: doc.youtubeId ?? null,
		bbc: doc.bbc ?? "",
		internet_archive: doc.internetArchive ?? "",
		svc: doc.svc ?? "",
		image: doc.image ?? null,
		trailers: doc.trailers?.length ? JSON.stringify(doc.trailers) : null,
		youtube_alternates: doc.youTubeAlternates?.length ? JSON.stringify(doc.youTubeAlternates) : null,
		imdb_id: doc.imdbId ?? null,
		tmdb_id: doc.tmdbId ?? null,
		tvdb_id: doc.tvdbId ?? null,
		series_imdb_id: doc.seriesImdbId ?? null,
		series_tmdb_id: doc.seriesTmdbId ?? null,
		series_tvdb_id: doc.seriesTvdbId ?? null,
		modified_at: doc.modifiedAt
	};
}

/** Newline-separated column; a newline inside an item would split it, so it becomes a space. */
function lines(items: string[] | null | undefined): string | null {
	const kept = (items ?? []).map((s) => s.replace(/\s*[\r\n]+\s*/g, " ").trim()).filter(Boolean);
	return kept.length ? kept.join("\n") : null;
}

/** Document ids are Cosmos ids: non-blank, at most 1024 characters (Azure's key limit). */
function parseId(value: unknown, at: string): string {
	if (typeof value !== "string" || !value.trim()) throw new SearchRequestError(`${at} must be a non-empty string`);
	if (value.length > 1024) throw new SearchRequestError(`${at} is longer than 1024 characters`);
	return value;
}

function requiredString(value: unknown, at: string): string {
	if (typeof value !== "string" || !value.trim()) throw new SearchRequestError(`${at} must be a non-empty string`);
	return value;
}

/** ISO-8601 date-time with an explicit zone (Z or ±hh:mm), as .NET serialises DateTimeOffset. */
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Stored as UTC `yyyy-MM-ddTHH:mm:ssZ`: one fixed format, so text order is time order (release sort). */
function parseRelease(value: unknown, at: string): string {
	if (typeof value !== "string" || !ISO_DATE_TIME.test(value) || Number.isNaN(Date.parse(value))) {
		throw new SearchRequestError(`${at} must be an ISO-8601 date-time with a zone`);
	}
	return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function parseModifiedAt(value: unknown, at: string): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		throw new SearchRequestError(`${at} must be a non-negative integer (epoch milliseconds)`);
	}
	return value;
}

function optionalArray(value: unknown, name: string): unknown[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) throw new SearchRequestError(`${name} must be an array`);
	return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
