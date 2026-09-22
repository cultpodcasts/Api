# Streaming scrape survey — Api-orchestrated (ephemeral isolates)

Hosts change. Re-run when prepare regresses or before changing `scrapeProfiles`.

**No probe Workers.** The survey is `POST /ops/streaming-scrape-survey` on deployed **Api**. Isolates are ephemeral. **PoP preflight is mandatory** — if `cdn-cgi/trace` for a CF leg is outside `expectedPop`, the Api returns **409 contaminated** and does not scrape catalogues.

## Auth

Auth0 Bearer with **`submit` or `curate`** (ops: M2M `client_credentials` on the Api audience).

## Legs

| Leg | Path | Purpose |
|-----|------|---------|
| `azure` | Azure `SubmitUrl/prepare` | Can UK Azure extract? |
| `cfFetch` | Api Worker `catalogHtmlPrepare` | Edge fetch |
| `cfBr` | Api `browserRenderingHtml` | **Hydration only** (ITVX-class) — not geo |
| `cfUsFetch` | `SCRAPE_US` + **directHttp** | **Geo soft-wall** (Hulu-class) — **never BR** |

BR is **not** region-pinnable. Geo surveys use placed **fetch** only, with fetch-trace preflight.

## Run

```powershell
$env:CULT_AUTH0_M2M_CLIENT_ID = "..."
$env:CULT_AUTH0_M2M_CLIENT_SECRET = "..."

npm run survey:streaming-scrape -- `
  -ApiBaseUrl https://api-preview.jonbreen.workers.dev `
  -SecretsFile ./scripts/local-secrets.preview.env `
  -ExpectedEdgeLocs GB `
  -ExpectedEdgeColos LHR `
  -IncludeUsFetch `
  -ExpectedUsLocs US
```

Requires Api **already deployed** with this route. Prefer Builds using `npm run deploy -- --env preview` so scrape-us-preview is published first — [`docs/workers-builds-deploy.md`](../../docs/workers-builds-deploy.md).

Prefer preview/workers.dev Api host if apex Bot Fight challenges M2M (see `docs/hero-curation-m2m-edge.md`).

## Contaminated

Exit code `2` / HTTP 409 — do **not** trust or publish results; fix PoP expectations or retry when the network path matches.

## Specimens

[`survey-urls.json`](./survey-urls.json)

## Related

- [`docs/streaming-scrape-findings.md`](../../docs/streaming-scrape-findings.md)
- Prepare smoke: `scripts/submit-prepare-field-smoke.ps1`
