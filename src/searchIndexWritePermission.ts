/**
 * Auth0 permission for writing the D1 search index (SP-1.4, cultpodcasts/Api#222).
 *
 * Defined on the Api (`https://api.cultpodcasts.com/`) and granted only to the search indexer's
 * M2M application, never to people. `POST /search/admin/docs` checks this permission and nothing
 * else. Auth0 setup: workers/search/README.md ("Auth0 setup for the write path").
 */
export const SEARCH_INDEX_WRITE_PERMISSION = "write:search-index";
