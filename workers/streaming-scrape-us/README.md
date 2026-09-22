# streaming-scrape-us

US-placed regional scrape Worker (`placement.region: aws:us-east-1`). Called only via Api service binding **`SCRAPE_US`** (no public Auth0).

## Preview vs production

| Api Worker | `SCRAPE_US` service |
|------------|---------------------|
| Top-level **`api`** (production) | **`streaming-scrape-us`** |
| **`api-preview`** (`--env preview`) | **`streaming-scrape-us-preview`** |

## Deploy (local ops)

Not part of Api Workers Builds (one Builds project = one Worker name). From repo root:

```powershell
npm run deploy:scrape-us:preview   # survey / preview geo only
npm run deploy:scrape-us           # production product path
```

**Preview twin lifecycle:** prefer `npm run survey:streaming-scrape … -IncludeUsFetch` — it
deploys `streaming-scrape-us-preview`, runs the survey, then **deletes** the Worker. Manual:

```powershell
npm run survey:scrape-us:ensure
npm run survey:scrape-us:teardown
```

Do not leave `streaming-scrape-us-preview` running between surveys. Production
`streaming-scrape-us` stays deployed for live Hulu/Peacock prepare.

Uses `wrangler.streaming-scrape-us.jsonc` at the repo root so shared `src/` imports resolve.

## Geo note

Worker placement soft-pins the **fetch** isolate. Browser Run is **not** region-pinnable — product geo path is `directHttp` on this Worker.
