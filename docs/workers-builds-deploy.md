# Workers Builds deploy commands (Api)

Git push deploys via Cloudflare Workers Builds. Keep **one** Builds project per Api Worker; chain the US scrape Worker in the deploy command so `SCRAPE_US` always resolves.

## Required dashboard settings

| Worker | Build command | Deploy command |
|--------|---------------|----------------|
| **api-preview** | `./build.sh` | `npm run deploy:preview:ci` |
| **api** (production / main) | `./build.sh` | `npm run deploy:ci` |

That publishes `streaming-scrape-us-preview` / `streaming-scrape-us` **before** Api, so the service binding does not fail with Worker not found.

Do **not** use `deploy:*:with-contract` until GitHub Packages billing works (see [`contract-publish.md`](./contract-publish.md) — deferred).

## Why not a second Builds project?

Possible, but a PR would need two Builds connections and still race Api vs scrape. Chaining in Api’s deploy command is one push → both Workers.

## Survey after preview is green

```powershell
npm run survey:streaming-scrape -- `
  -ApiBaseUrl https://api-preview.jonbreen.workers.dev `
  -SecretsFile ./scripts/local-secrets.preview.env `
  -ExpectedEdgeLocs GB `
  -ExpectedEdgeColos LHR `
  -IncludeUsFetch `
  -ExpectedUsLocs US
```

Needs Auth0 M2M (`submit` or `curate`) — see [`scripts/streaming-scrape-survey/README.md`](../scripts/streaming-scrape-survey/README.md).
