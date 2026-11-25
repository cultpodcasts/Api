import { readSession, servedBy } from "./d1-session";
import type { SearchEnv } from "./env";

/** Must match the `schema_version` row written by the latest migration in ../migrations. */
export const SEARCH_SCHEMA_VERSION = "3";

type Health = {
	ok: boolean;
	worker: "search";
	environment: string;
	schemaVersion: string | null;
	expectedSchemaVersion: string;
	/** Region that answered (SP-1.2): a replica region when read replication served it, else the primary's. */
	servedByRegion?: string | null;
	servedByPrimary?: boolean | null;
	error?: string;
};

export function json(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
			...extraHeaders
		}
	});
}

export async function health(env: SearchEnv): Promise<Response> {
	const base = {
		worker: "search" as const,
		environment: env.searchEnvironment ?? "unknown",
		expectedSchemaVersion: SEARCH_SCHEMA_VERSION
	};
	try {
		// Same read path as search (Sessions API), so health reports the schema search actually
		// sees: a replica can trail the primary for a few seconds after a migration.
		const result = await readSession(env)
			.prepare("SELECT value FROM search_meta WHERE key = ?")
			.bind("schema_version")
			.all<{ value: string }>();
		const schemaVersion = result.results[0]?.value ?? null;
		const ok = schemaVersion === SEARCH_SCHEMA_VERSION;
		const { servedByRegion, servedByPrimary } = servedBy([result]);
		const body: Health = { ...base, ok, schemaVersion, servedByRegion, servedByPrimary };
		if (!ok) body.error = "schema version mismatch: apply workers/search/migrations";
		return json(body, ok ? 200 : 503);
	} catch (e) {
		// D1 unavailable or migrations not applied: retryable, never a 4xx.
		const body: Health = {
			...base,
			ok: false,
			schemaVersion: null,
			error: e instanceof Error ? e.message : String(e)
		};
		return json(body, 503);
	}
}
