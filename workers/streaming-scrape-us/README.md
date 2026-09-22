# streaming-scrape-us

US-placed regional scrape Worker (`placement.region: aws:us-east-1`). Called only via Api service binding **`SCRAPE_US`** (no public Auth0).

## Preview vs production

| Api Worker | `SCRAPE_US` service |
|------------|---------------------|
| Top-level **`api`** (production) | **`streaming-scrape-us`** |
| **`api-preview`** (`--env preview`) | **`streaming-scrape-us-preview`** |

Same script, two publishes — so preview surveys / prepare do not hit production scrape.

## Automatic deploy (recommended)

Do **not** rely on a second Workers Builds project. Chain scrape → Api in the **existing** Api Builds deploy commands:

| Worker Builds | Deploy command |
|---------------|----------------|
| **api-preview** | `npm run deploy:preview:ci` |
| **api** (production) | `npm run deploy:ci` |

`deploy:preview:ci` = `deploy:scrape-us:preview` then `wrangler deploy --env preview`.  
`deploy:ci` = `deploy:scrape-us` then `wrangler deploy`.

One PR / main push then creates the scrape Worker (if missing) and deploys Api with a resolvable `SCRAPE_US` binding.

Set these under each Worker → **Settings** → **Build** → **Deploy command** (dashboard). Build command can stay `./build.sh`.

## Manual deploy

```powershell
npm run deploy:scrape-us:preview   # streaming-scrape-us-preview
npm run deploy:scrape-us           # streaming-scrape-us
```

(Explicit ask only — see no-deploys rule.)

## Geo note

Worker placement soft-pins the **fetch** isolate. Browser Run is **not** region-pinnable — product geo path is `directHttp` on this Worker.
