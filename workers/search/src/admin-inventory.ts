import { writeDb } from "./d1-session";
import type { SearchEnv } from "./env";
import { badRequest, d1Unavailable } from "./errors";
import { json } from "./health";

/**
 * `GET /admin/docs/inventory`: the id inventory of the search index (SP-2.2, RPP #1322).
 *
 * The weekly reconcile compares this with the Cosmos catalogue. It upserts documents that are
 * missing or older than Cosmos and deletes orphans. Each page is `{ items: [{ id, modifiedAt }],
 * next }`, keyset-paged by `id` (UNIQUE, so it's an index range scan): pass `next` back as `after`
 * until it is null. Query: `after` (exclusive, default the start) and `limit` (1..10000, default
 * 5000).
 *
 * Reads run on the primary, not a replica session. The reconcile writes right after it reads, so
 * it must not diff against a replica that is behind its own last write.
 *
 * Auth: like `POST /admin/docs`, there's no public ingress. The api Worker's
 * `GET /search/admin/docs/inventory` (Auth0 M2M `write:search-index`) is the only caller.
 */
export const ADMIN_INVENTORY_PATH = "/admin/docs/inventory";
export const DEFAULT_INVENTORY_LIMIT = 5000;
export const MAX_INVENTORY_LIMIT = 10000;

export type InventoryItem = { id: string; modifiedAt: number };
export type InventoryPage = { items: InventoryItem[]; next: string | null };

/** Parses `after` / `limit`; throws a message naming the bad parameter. */
export function parseInventoryQuery(url: URL): { after: string; limit: number } {
	const after = url.searchParams.get("after") ?? "";
	const rawLimit = url.searchParams.get("limit");
	let limit = DEFAULT_INVENTORY_LIMIT;
	if (rawLimit !== null) {
		if (!/^\d+$/.test(rawLimit)) throw new Error("limit must be an integer from 1 to 10000");
		limit = Number(rawLimit);
		if (limit < 1 || limit > MAX_INVENTORY_LIMIT) throw new Error("limit must be an integer from 1 to 10000");
	}
	if (after.length > 1024) throw new Error("after must be at most 1024 characters");
	return { after, limit };
}

export async function adminInventory(request: Request, env: SearchEnv): Promise<Response> {
	let query: { after: string; limit: number };
	try {
		query = parseInventoryQuery(new URL(request.url));
	} catch (e) {
		return badRequest(e);
	}
	let rows: { id: string; modified_at: number }[];
	try {
		// One row past the page says whether there is a next page without a COUNT.
		const result = await writeDb(env)
			.prepare("SELECT id, modified_at FROM search_docs WHERE id > ?1 ORDER BY id LIMIT ?2")
			.bind(query.after, query.limit + 1)
			.all<{ id: string; modified_at: number }>();
		rows = result.results;
	} catch (e) {
		return d1Unavailable(e);
	}
	const page = rows.slice(0, query.limit);
	const body: InventoryPage = {
		items: page.map((r) => ({ id: r.id, modifiedAt: Number(r.modified_at) })),
		next: rows.length > query.limit ? page[page.length - 1].id : null
	};
	return json(body, 200);
}
