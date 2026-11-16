import type { SearchEnv } from "./env";

/** Must match the `schema_version` row written by the latest migration in ../migrations. */
export const SEARCH_SCHEMA_VERSION = "1";

type Health = {
	ok: boolean;
	worker: "search";
	environment: string;
	schemaVersion: string | null;
	expectedSchemaVersion: string;
	error?: string;
};

export function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
	});
}

export async function health(env: SearchEnv): Promise<Response> {
	const base = {
		worker: "search" as const,
		environment: env.searchEnvironment ?? "unknown",
		expectedSchemaVersion: SEARCH_SCHEMA_VERSION
	};
	try {
		const row = await env.SEARCH_DB.prepare("SELECT value FROM search_meta WHERE key = ?")
			.bind("schema_version")
			.first<{ value: string }>();
		const schemaVersion = row?.value ?? null;
		const ok = schemaVersion === SEARCH_SCHEMA_VERSION;
		const body: Health = { ...base, ok, schemaVersion };
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
