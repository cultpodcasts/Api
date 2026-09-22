# Workers Builds (Api)

Api Builds only publishes Api. Survey / US scrape is **local ops**.

| Worker | Typical deploy command |
|--------|------------------------|
| **api** | `npx wrangler deploy` or `npm run deploy` |
| **api-preview** | `npx wrangler deploy --env preview` or `npm run deploy -- --env preview` |

## US scrape (local)

Before api-preview can bind `SCRAPE_US`, publish once from a machine with wrangler auth:

```powershell
npm run deploy:scrape-us:preview
# production twin when needed:
npm run deploy:scrape-us
```

Config: root `wrangler.streaming-scrape-us.jsonc`.

## Survey (local → deployed Api)

```powershell
npm run deploy:scrape-us:preview   # if scrape Worker missing / stale
# wait for api-preview Builds with survey route, then:
npm run survey:streaming-scrape -- `
  -ApiBaseUrl https://api-preview.jonbreen.workers.dev `
  -SecretsFile ./scripts/local-secrets.preview.env `
  -ExpectedEdgeLocs GB -ExpectedEdgeColos LHR `
  -IncludeUsFetch -ExpectedUsLocs US
```
