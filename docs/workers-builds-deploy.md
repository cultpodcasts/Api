# Workers Builds deploy commands (Api)

`npm run deploy` publishes the US scrape Worker **first**, then Api (see `scripts/cf-deploy.mjs`).

| Worker Builds | Deploy command |
|---------------|----------------|
| **api** (production) | `npm run deploy` |
| **api-preview** | `npm run deploy -- --env preview` |

If preview is still set to `npx wrangler deploy --env preview`, switch it to `npm run deploy -- --env preview` once — after that, scrape stays chained automatically.

Build command can stay `./build.sh`.

Do **not** use `deploy:*:with-contract` until GitHub Packages billing works.

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
