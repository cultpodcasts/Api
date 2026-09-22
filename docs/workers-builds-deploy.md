# Workers Builds deploy (Api + US scrape)

## Api

| Worker | Deploy command |
|--------|----------------|
| **api** | `npm run deploy` |
| **api-preview** | `npm run deploy -- --env preview` |

Under **Workers Builds**, `npm run deploy` only publishes **Api**. Cloudflare binds each Builds project to one Worker name and rejects publishing `streaming-scrape-us(-preview)` from the Api connection.

## US scrape (required for `SCRAPE_US`)

Pick one:

### A — One-off / ops (fastest)

```powershell
npm run deploy:scrape-us:preview
npm run deploy:scrape-us
```

### B — Automatic: second Builds project

Connect the same `cultpodcasts/Api` repo to a **new** Worker Builds for `streaming-scrape-us` / `streaming-scrape-us-preview`:

| Target Worker | Deploy command |
|---------------|----------------|
| streaming-scrape-us-preview | `npx wrangler deploy -c ./wrangler.streaming-scrape-us.jsonc --env preview` |
| streaming-scrape-us | `npx wrangler deploy -c ./wrangler.streaming-scrape-us.jsonc` |

Build command: `./build.sh` (or empty). Root directory `/`.

Deploy scrape **before** Api when both build on the same push (or accept a failed Api build until scrape exists once).

## Survey

```powershell
npm run survey:streaming-scrape -- `
  -ApiBaseUrl https://api-preview.jonbreen.workers.dev `
  -SecretsFile ./scripts/local-secrets.preview.env `
  -ExpectedEdgeLocs GB -ExpectedEdgeColos LHR `
  -IncludeUsFetch -ExpectedUsLocs US
```
