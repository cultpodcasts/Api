# Cult Podcasts API Worker — agent notes

Cloudflare Worker gateway (`api` / `api-preview`) in front of Azure Functions (`api-infra`).

## No deploys (HARD)

**Never** run `wrangler deploy` / `npm run deploy` (preview or production) unless the user
explicitly names that exact deploy in the current conversation. Git push to a PR branch is OK
when asked; do not treat “enable” / “ship” / feature flips as deploy approval.

- Rule: [`.cursor/rules/no-api-website-deploys.mdc`](.cursor/rules/no-api-website-deploys.mdc)

## Preview ↔ production secrets (HARD)

Any new Worker secret for preview/staging **must** also be planned for production.

- Rule: [`.cursor/rules/preview-production-secrets-parity.mdc`](.cursor/rules/preview-production-secrets-parity.mdc)
- Docs: [`docs/worker-secrets.md`](docs/worker-secrets.md)
- PR body **must** include `## Config / secrets` with **secret names** (never values)
- Parity check: `pwsh ./scripts/assert-secrets-example-parity.ps1`
- Live production secrets go on top-level Worker **`api`** (`set-secrets-production.ps1` / `--env=`). Do **not** use `--env production` (that is `api-production`, not serving `api.cultpodcasts.com`).

## Version

Semver patch (or higher) in `package.json` + `package-lock.json` on every shipping PR.

## Cursor Cloud specific instructions

Multi-repo workspace: this repo is at `/agent/repos/api` alongside `/agent/repos/website` and
`/agent/repos/redditpodcastposter`. The startup update script runs `npm ci` + `./build.sh`
(`prisma generate`) here.

- **Node**: the app needs Node 22.22.3 (installed via nvm). Login shells (`bash -lc`, tmux) get it
  from `~/.bashrc`. The sandbox ships an older `/exec-daemon/node` (22.14.0) that shadows PATH in
  bare non-login shells — prefer `bash -lc "…"` or prepend `$HOME/.nvm/versions/node/v22.22.3/bin`.
- **Local dev**: `npm run start` serves the Worker at `https://127.0.0.1:8787` and requires
  `.cert/dev-cert.pem` + `.cert/dev-key.pem` (self-signed, gitignored, persisted in the snapshot).
  If missing, regenerate a SAN cert for `local.cultpodcasts.com`, `localhost`, `127.0.0.1`. A hosts
  entry `127.0.0.1 local.cultpodcasts.com` is set so the website can reach the worker by hostname.
- **Local bindings/data**: D1/KV/R2/DO/Analytics all run under Miniflare (`--env local`), but the
  buckets are empty. Self-contained endpoints work offline: `GET /og-image?u=<img>&a=wide&t=<title>&pl=spotify,apple`
  returns a composed 1200×630 PNG; `GET /docs` (302→Swagger). `/homepage`, `/subjects`, `/search`
  etc. need seeded R2 or the Azure Functions backend + secrets. To demo homepage content locally,
  seed the R2 `content/homepage` object: `npx wrangler r2 object put content/homepage --file=<json> --local`
  (shape: `{ recentEpisodes: HomepageEpisode[], episodeCount, totalDuration }`).
- Never deploy (see the No-deploys rule); local `wrangler dev` only.
