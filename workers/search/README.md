# search

Search platform Worker (epic [RedditPodcastPoster#1312](https://github.com/cultpodcasts/RedditPodcastPoster/issues/1312),
Gate G1). It owns the **dedicated search D1 database** `cultpodcasts-search` (SP-1.1,
[Api#219](https://github.com/cultpodcasts/Api/issues/219)) and will serve the D1 FTS5 engine
that replaces Azure AI Search, running side by side with Azure until cutover (G4).

Design docs: RedditPodcastPoster `docs/search-platform/` (start at `README.md`).

## Shape

| Worker | Config | D1 binding | Database |
|--------|--------|-----------|----------|
| `search` (production) | `wrangler.search.jsonc` top level | `SEARCH_DB` | `cultpodcasts-search` |
| `search-preview` | `wrangler.search.jsonc` `--env preview` | `SEARCH_DB` | `cultpodcasts-search` (same id) |
| local | `--env local` | `SEARCH_DB` | Miniflare only |

- **Dedicated:** never the api Worker's `apiDB` (`cultpodcasts-api`), and the api Worker does
  not bind this database. It reaches this Worker over a **service binding** (SP-1.3), because
  zone Bot Fight Mode challenges server POSTs to public hostnames.
- **Service-binding only:** `workers_dev: false`, `preview_urls: false`, no routes.
- **Preview and production share one database**, like `apiDB`: the preview soak and the G4
  preview `apihost` flip must read the index the backend actually syncs. Writes come only from
  the backend sync path (G2), never from preview code paths.
- Region: primary in **WEUR** (near Azure Functions / Cosmos). Read replication
  (`mode: auto`) and Sessions API reads are SP-1.2.
- Not part of Api Workers Builds (one Builds project = one Worker name).

## Schema

`migrations/0001_search_schema.sql`:

- `search_docs`: one row per playable (Episode, TvShowEpisode, Film, NewsReport), mirroring
  RPP `EpisodeSearchRecord`, plus **full descriptions**, **guests**, film
  **`alternative_titles`**, identity ids (`imdb_id`, `tmdb_id`, `tvdb_id`, series variants)
  and `modified_at` for the SP-1.4 stale-replay guard.
- `doc_subjects`: subject filter/facet rows (cascade on delete).
- `search_fts`: external-content FTS5, `tokenize='porter unicode61'`, kept in step by
  insert/update/delete triggers. Column order is a contract (SP-1.8 weights against it):
  `title, alternative_titles, series_name, subjects_text, description, guests,
  publisher_search_terms, episode_search_terms`. Changing it needs a shadow rebuild (SP-2.3).
- `search_meta`: `schema_version`. `GET /health` returns 503 until it matches
  `SEARCH_SCHEMA_VERSION` in `src/health.ts`.

## Provision (Jon, once; not done by agents)

```powershell
# 1. Create the database in WEUR. Copy the printed database_id.
npx wrangler d1 create cultpodcasts-search --location weur

# 2. Replace both PLACEHOLDER-cultpodcasts-search-database-id values in
#    wrangler.search.jsonc (top level + env.preview) with that id, in a PR.

# 3. Apply the schema to the remote database.
npx wrangler d1 migrations apply cultpodcasts-search --remote -c ./wrangler.search.jsonc --env=""

# 4. Deploy only when explicitly decided (preview first).
npm run deploy:search:preview
npm run deploy:search
```

## Local

```sh
npm run search:migrate:local
npm run search:dev            # http://127.0.0.1:8789/health
```

## Routes

| Route | Purpose |
|-------|---------|
| `GET /health` | 200 when D1 answers and the schema version matches; 503 otherwise (retryable) |

The query engine (ported from `search-demo/`), Sessions API reads (SP-1.2) and the admin
upsert/delete route (SP-1.4) land here in their own tickets.
