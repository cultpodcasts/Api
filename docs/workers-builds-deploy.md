# Workers Builds (Api)

Api Builds only publishes Api. US scrape Workers are separate local/ops deploys (one Builds project = one Worker name).

| Worker | Typical deploy command |
|--------|------------------------|
| **api** | `npx wrangler deploy` or `npm run deploy` |
| **api-preview** | `npx wrangler deploy --env preview` or `npm run deploy -- --env preview` |

Do **not** wire `deploy:*:with-contract` into Builds — GitHub Packages publish is deferred ([`contract-publish.md`](./contract-publish.md)).

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
