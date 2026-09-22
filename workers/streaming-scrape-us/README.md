# streaming-scrape-us

US-placed regional scrape Worker (`placement.region: aws:us-east-1`). Called only via Api service binding **`SCRAPE_US`** (no public Auth0).

## Preview vs production

| Api Worker | `SCRAPE_US` service |
|------------|---------------------|
| Top-level **`api`** (production) | **`streaming-scrape-us`** |
| **`api-preview`** (`--env preview`) | **`streaming-scrape-us-preview`** |

## Automatic deploy

Chained from Api’s `npm run deploy` (see `scripts/cf-deploy.mjs` / [`docs/workers-builds-deploy.md`](../../docs/workers-builds-deploy.md)):

- `npm run deploy` → scrape-us + api  
- `npm run deploy -- --env preview` → scrape-us-preview + api-preview  

## Manual

```powershell
npm run deploy:scrape-us:preview
npm run deploy:scrape-us
```

## Geo note

Worker placement soft-pins the **fetch** isolate. Browser Run is **not** region-pinnable — product geo path is `directHttp` on this Worker.
