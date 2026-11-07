# search-demo — D1 FTS5 prototype for the search-platform epic

A throwaway Worker that serves Azure-AI-Search-shaped responses from a local D1
database built from a real Cosmos backup (89,245 playables with **full,
untruncated descriptions**, guests, and subjects). Decision context: <!-- pragma: allowlist secret -->
`RedditPodcastPoster/docs/search-platform-epic.md`.

**Local `wrangler dev` only. Never deploy this Worker.**

## Build the database

1. Export Cosmos with `CosmosDbDownloader` (read-only) in the RedditPodcastPoster repo.
2. Project the backup into `corpus.jsonl` and load it into a local D1 state dir
   with the loader harness (kept outside the repo — the corpus contains the
   hidden curator search-term fields, which must not be committed; this repo is
   public). The loader creates `search_docs`, `doc_subjects`, and the <!-- pragma: allowlist secret -->
   `search_fts` FTS5 external-content table with sync triggers, then runs <!-- pragma: allowlist secret -->
   `INSERT INTO search_fts(search_fts) VALUES ('rebuild')` and `('optimize')`.
3. The loader's wrangler config must use the same `database_id` as
   `search-demo/wrangler.jsonc` so both resolve to the same Miniflare SQLite file.

Real-data checkpoint (2026-11-07): full database 239 MB total — `search_docs`
149.5 MB, FTS5 index ≈ 66 MB — i.e. 2.3% of D1's 10 GB per-database limit.

## Run

```sh
npx wrangler dev --config search-demo/wrangler.jsonc --persist-to <state-dir> --port 8788
```

## Query

```
GET /search?q=scientology                         # FTS, ORDER BY rank
GET /search?q=jehovah+witnesses&orderby=release   # FTS, recency sort
GET /search?q=nxivm&facets=true                   # + subject/kind/lang facet counts
GET /search?subject=Scientology                   # browse: subject filter, no FTS
GET /search?series=Mormon+Stories+Podcast&top=5   # series page
GET /search?kind=NewsReport                       # content-kind filter <!-- pragma: allowlist secret -->
GET /search?q=daybell&lang=en&skip=20&top=20      # paging; lang=en matches stored NULL
```

Response shape mirrors what the website binds from Azure Search today:
`{ "@odata.count", value: [ { id, contentKind, title, seriesName, description <!-- pragma: allowlist secret -->
(snippet with <b> highlights), release, duration, lang, spotifyId, youtubeId,
appleId, podcastAppleId, image, svc, bbc, subjects[] } ], "@search.facets"? }`. <!-- pragma: allowlist secret -->
