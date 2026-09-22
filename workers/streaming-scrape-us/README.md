# streaming-scrape-us

US-placed regional scrape Worker (`placement.region: aws:us-east-1`). Called only via Api service binding **`SCRAPE_US`** (no public Auth0).

## Preview vs production

| Api Worker | `SCRAPE_US` service |
|------------|---------------------|
| Top-level **`api`** (production) | **`streaming-scrape-us`** |
| **`api-preview`** (`--env preview`) | **`streaming-scrape-us-preview`** |

Same script, two publishes — so preview surveys / prepare do not hit production scrape.

## Deploy (separate from Api)

Workers Builds / `wrangler` must target **this** config; Api Git deploys do **not** publish it.

```powershell
# Preview (bind target for api-preview)
npx wrangler deploy -c ./workers/streaming-scrape-us/wrangler.jsonc --env preview

# Production (bind target for top-level api)
npx wrangler deploy -c ./workers/streaming-scrape-us/wrangler.jsonc
```

Or: `npm run deploy:scrape-us:preview` / `npm run deploy:scrape-us` (explicit ask only — see no-deploys rule).

Configure **two** Workers Builds projects on this repo (root directory `workers/streaming-scrape-us`), one for each Worker name / env, mirroring Api preview vs production.

## Geo note

Worker placement soft-pins the **fetch** isolate. Browser Run is **not** region-pinnable — product geo path is `directHttp` on this Worker.
