# streaming-scrape-us

US-placed regional scrape Worker (`placement.region: aws:us-east-1`). Called only via Api service binding **`SCRAPE_US`** (no public Auth0).

**Product** geo prepare for Hulu/Peacock — not a survey-only Worker. Survey is `POST /ops/streaming-scrape-survey` on Api (ephemeral isolates).

## Preview vs production

| Api Worker | `SCRAPE_US` service |
|------------|---------------------|
| Top-level **`api`** (production) | **`streaming-scrape-us`** |
| **`api-preview`** (`--env preview`) | **`streaming-scrape-us-preview`** |

Keep the preview twin deployed alongside api-preview so Builds and geo prepare work. Survey scripts do **not** ensure/teardown this Worker.

## Deploy (local ops)

Not part of Api Workers Builds (one Builds project = one Worker name). From repo root:

```powershell
npm run deploy:scrape-us:preview
npm run deploy:scrape-us           # production only when explicitly requested
```

Uses `wrangler.streaming-scrape-us.jsonc` at the repo root so shared `src/` imports resolve.

## Geo note

Worker placement soft-pins the **fetch** isolate. This Worker accepts **`directHttp` only** — Browser Rendering is rejected (422). BR stays on the edge Api Worker for ITVX-class hydration.

<!-- builds watch-path probe 2026-09-22T18:54:13.7232978+01:00 -->

