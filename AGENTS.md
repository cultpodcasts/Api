# Cult Podcasts API Worker — agent notes

Cloudflare Worker gateway (`api` / `api-preview`) in front of Azure Functions (`api-infra`).

## No deploys (HARD)

**Never** run `wrangler deploy` / `npm run deploy` (preview or production) unless the user
explicitly names that exact deploy in the current conversation. Git push to a PR branch is OK
when asked; do not treat “enable” / “ship” / feature flips as deploy approval.

- Rule: [`.cursor/rules/no-api-website-deploys.mdc`](.cursor/rules/no-api-website-deploys.mdc)

## Auth0 permissions (Worker)

JWT **`permissions[]`** and OAuth **`scope`** are checked via `hasPermission` (not ID-token roles). Submit/lookup Azure gate: `canCallAzureSubmitBackend` in `src/submitAccess.ts` (`submit` or `curate`).

- Cross-repo map: [`website/cultpodcasts/docs/auth0-roles-and-permissions.md`](../website/cultpodcasts/docs/auth0-roles-and-permissions.md)

## Planned catalogue content types epic (not scheduled)

Separate TvShow / Movie / News Cosmos containers + unified search `contentKind` facet. Worker search passthrough and new proxy routes — **planning only** until a phase is explicitly started.

- Epic + Phase 0 ADRs: [`RedditPodcastPoster/docs/catalogue-content-types-epic.md`](../cultpodcasts/RedditPodcastPoster/docs/catalogue-content-types-epic.md)
- Search storage impact: [`RedditPodcastPoster/docs/catalogue-content-types-search-storage-impact.md`](../cultpodcasts/RedditPodcastPoster/docs/catalogue-content-types-search-storage-impact.md)

## Preview ↔ production secrets (HARD)

Any new Worker secret for preview/staging **must** also be planned for production.

- Rule: [`.cursor/rules/preview-production-secrets-parity.mdc`](.cursor/rules/preview-production-secrets-parity.mdc)
- Docs: [`docs/worker-secrets.md`](docs/worker-secrets.md)
- PR body **must** include `## Config / secrets` with **secret names** (never values)
- Parity check: `pwsh ./scripts/assert-secrets-example-parity.ps1`
- Live production secrets go on top-level Worker **`api`** (`set-secrets-production.ps1` / `--env=`). Do **not** use `--env production` (that is `api-production`, not serving `api.cultpodcasts.com`).

## Version

Semver patch (or higher) in `package.json` + `package-lock.json` on every shipping PR.

## Cursor Cloud specific instructions <!-- pragma: allowlist secret -->

Multi-repo workspace: this repo is at `/agent/repos/api` alongside `/agent/repos/website` and <!-- pragma: allowlist secret -->
`/agent/repos/redditpodcastposter`. The startup update script runs `npm ci` + `./build.sh` <!-- pragma: allowlist secret -->
(`prisma generate`) here. <!-- pragma: allowlist secret -->

- **Node**: the app needs Node 22.22.3 (installed via nvm). Login shells (`bash -lc`, tmux) get it <!-- pragma: allowlist secret -->
  from `~/.bashrc`. The sandbox ships an older `/exec-daemon/node` (22.14.0) that shadows PATH in <!-- pragma: allowlist secret -->
  bare non-login shells — prefer `bash -lc "…"` or prepend `$HOME/.nvm/versions/node/v22.22.3/bin`. <!-- pragma: allowlist secret -->
- **Local dev**: `npm run start` serves the Worker at `https://127.0.0.1:8787` and requires <!-- pragma: allowlist secret -->
  `.cert/dev-cert.pem` + `.cert/dev-key.pem` (self-signed, gitignored, persisted in the snapshot). <!-- pragma: allowlist secret -->
  If missing, regenerate a SAN cert for `local.cultpodcasts.com`, `localhost`, `127.0.0.1`. A hosts <!-- pragma: allowlist secret -->
  entry `127.0.0.1 local.cultpodcasts.com` is set so the website can reach the worker by hostname. <!-- pragma: allowlist secret -->
- **Local bindings/data**: D1/KV/R2/DO/Analytics all run under Miniflare (`--env local`), but the <!-- pragma: allowlist secret -->
  buckets are empty. Self-contained endpoints work offline: `GET /og-image?u=<img>&a=wide&t=<title>&pl=spotify,apple` <!-- pragma: allowlist secret -->
  returns a composed 1200×630 PNG; `GET /docs` (302→Swagger). `/homepage`, `/subjects`, `/search` <!-- pragma: allowlist secret -->
  etc. need seeded R2 or the Azure Functions backend + secrets. To demo homepage content locally, <!-- pragma: allowlist secret -->
  seed the R2 `content/homepage` object: `npx wrangler r2 object put content/homepage --file=<json> --local` <!-- pragma: allowlist secret -->
  (shape: `{ recentEpisodes: HomepageEpisode[], episodeCount, totalDuration }`). <!-- pragma: allowlist secret -->
- Never deploy (see the No-deploys rule); local `wrangler dev` only. <!-- pragma: allowlist secret -->
