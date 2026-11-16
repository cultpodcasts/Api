/** Bindings for the search Worker (`search` / `search-preview`). See wrangler.search.jsonc. */
export type SearchEnv = {
	/** Dedicated search D1 database `cultpodcasts-search` (SP-1.1). Never the api Worker's apiDB. */
	SEARCH_DB: D1Database;
	/** Non-secret: production | preview | local. */
	searchEnvironment?: string;
};
