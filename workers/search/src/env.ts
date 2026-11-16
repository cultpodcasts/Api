/** Bindings for the search Worker (`search` / `search-preview`). See wrangler.search.jsonc. */
export type SearchEnv = {
	/** Dedicated search D1 database (SP-1.1): `cultpodcasts-search`, or `cultpodcasts-search-preview` on search-preview. Never apiDB. */
	SEARCH_DB: D1Database;
	/** Non-secret: production | preview | local. */
	searchEnvironment?: string;
};
