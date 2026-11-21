# Workers Builds (Api)

Api Builds only publishes Api. US scrape Workers are separate local/ops deploys (one Builds project = one Worker name).

| Worker | Typical deploy command |
|--------|------------------------|
| **api** | `npx wrangler deploy` or `npm run deploy` |
| **api-preview** | `npx wrangler deploy --env preview` or `npm run deploy -- --env preview` |

## Build variable: `NODE_AUTH_TOKEN` (required)

`npm ci` installs the private `@cultpodcasts/contracts` package from GitHub Packages (`.npmrc`, RedditPodcastPoster#1502). Each Workers Builds project that builds this repo (**api**, **api-preview**, **streaming-scrape-us** and **streaming-scrape-us-preview**) needs a **build** variable (secret) named `NODE_AUTH_TOKEN`: a GitHub PAT with `read:packages`. It is a build-time variable (Settings → Build → Variables and secrets), not a Worker runtime secret. Without it the build fails at `npm ci` with 401/403 and the previous deployment keeps serving. Set it on both the **Production** and **Preview** build settings (PR branches use Preview, which has its own variables list). As of 2026-11-21 only **api-preview** and **streaming-scrape-us-preview** are connected to Workers Builds; **api** and **streaming-scrape-us** have no Builds trigger, so set it there if they are ever connected.

**PAT scope and expiry.** Use a **classic** PAT with **only** `read:packages` (no `repo`, no `write:packages`) and an expiry. The same token is the `NODE_AUTH_TOKEN` Actions secret, and `search-stack.yml` deliberately passes it to the `npm ci` step whose dependency install scripts run (all other secrets are blanked there; `--ignore-scripts` is not an option because wrangler needs `workerd`'s postinstall), so a malicious install script could read it. Keeping it read-only on packages limits that to reading `@cultpodcasts` packages. When it expires, rotate it everywhere at once: the Actions secret (plus a Dependabot secret, `gh secret set NODE_AUTH_TOKEN -R cultpodcasts/Api --app dependabot`, if Dependabot PRs need `npm ci`) and each Builds project's build variable, Production and Preview build settings.

Consuming `@cultpodcasts/contracts` (above) is live. What is still deferred is *publishing this repo's own* streaming-submit contract: do **not** wire `deploy:*:with-contract` into Builds ([`contract-publish.md`](./contract-publish.md)).

## US scrape (product geo prepare)

| Worker | Role |
|--------|------|
| **streaming-scrape-us** (prod) | Live geo prepare for top-level **`api`** (`SCRAPE_US`) — keep deployed |
| **streaming-scrape-us-preview** | Preview twin for **`api-preview`** — keep deployed like api-preview |

Survey (`POST /ops/streaming-scrape-survey`) does **not** deploy or tear down these Workers. They are product regional scrape Workers, not survey-only.

```powershell
npm run deploy:scrape-us:preview   # preview twin (before api-preview needs SCRAPE_US)
npm run deploy:scrape-us           # production — only when explicitly requested
```

Config: root `wrangler.streaming-scrape-us.jsonc`.

## Survey (local → deployed Api)

```powershell
npm run survey:streaming-scrape -- `
  -ApiBaseUrl https://api-preview.jonbreen.workers.dev `
  -SecretsFile ./scripts/local-secrets.preview.env `
  -ExpectedEdgeLocs GB -ExpectedEdgeColos LHR `
  -IncludeUsFetch -ExpectedUsColos IAD
```

`-IncludeUsFetch` requires `streaming-scrape-us-preview` already bound as `SCRAPE_US` on api-preview. Compare: `npm run survey:compare-contract`. Skill: `.cursor/skills/streaming-scrape-survey/SKILL.md`.
