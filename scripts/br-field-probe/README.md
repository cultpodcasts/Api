# BR field probe — legacy ad-hoc only

Prefer the **Api survey**: [`../streaming-scrape-survey/README.md`](../streaming-scrape-survey/README.md) (`POST /ops/streaming-scrape-survey`).

This folder still exercises production `browserRenderingHtml` / `catalogHtmlPrepare` for one-off debugging. Do **not** use `wrangler dev` for ship decisions. Do **not** leave permanent survey probe Workers for geo (BR is not region-pinnable; geo uses `SCRAPE_US` fetch).

See [`docs/streaming-scrape-findings.md`](../../docs/streaming-scrape-findings.md).
