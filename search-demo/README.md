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

Note: `wrangler dev --persist-to` reads `<state-dir>/v3/d1/...` while the
`getPlatformProxy` loader writes `<state-dir>/d1/...` — symlink `v3/d1 -> ../d1`
inside the state dir (or load via a config wrangler dev also uses).

## Web UI + Auth0 lock-down

`GET /` serves a search page (Auth0 SPA SDK). The tenant/client identifiers are
**not committed** — same convention as the root Worker's secret-managed auth0
config. Create a gitignored `search-demo/.dev.vars` with `AUTH0_DOMAIN`,
`AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE` (copy the values from the website repo's
`environment.production.ts` / `app.config.ts`). `GET /search` requires a
valid Auth0 **access token** and authorises on the `permissions[]` claim, the
same model as the production api Worker (`Auth0Middleware` / `hasPermission`,
`@cfworker/jwt`): any permission listed in the `REQUIRED_PERMISSIONS` var
(default `curate`) grants access. No token → 401; token without the permission
→ 403.

To browse from outside the dev machine, expose the port with a quick tunnel:

```sh
cloudflared tunnel --url http://localhost:8788
```

Then add the printed `https://….trycloudflare.com` URL to the Auth0 SPA
application (the one the website uses) under **Allowed Callback URLs,
Allowed Logout URLs, Allowed Web Origins** — quick-tunnel hostnames are random
per run, so this is a per-session dashboard edit. Sign in on the page and
search. Remove the URL from Auth0 when done.

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
