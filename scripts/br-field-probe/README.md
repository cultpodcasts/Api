# BR field probe — legacy ad-hoc only

Prefer the **Api survey**: [`../streaming-scrape-survey/README.md`](../streaming-scrape-survey/README.md) (`POST /ops/streaming-scrape-survey`).

This folder still exercises production `browserRenderingHtml` / `catalogHtmlPrepare` for one-off **edge** BR debugging. Do **not** use `wrangler dev` for ship decisions. Do **not** deploy permanent US/geo probe Workers — geo uses product `streaming-scrape-us` via `SCRAPE_US` (`directHttp` only).

See [`docs/streaming-scrape-findings.md`](../../docs/streaming-scrape-findings.md).
