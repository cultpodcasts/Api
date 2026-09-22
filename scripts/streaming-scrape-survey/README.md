# Streaming scrape survey — Api-orchestrated (ephemeral isolates)

Hosts change. Re-run when prepare regresses or before changing `scrapeProfiles`.

**No permanent probe Workers.** Survey is `POST /ops/streaming-scrape-survey` on deployed **Api** (ephemeral isolates only).

**`streaming-scrape-us` / `streaming-scrape-us-preview`** are **product** regional scrape Workers for geo prepare (`SCRAPE_US`). Keep the preview twin deployed like api-preview. Survey does **not** deploy or tear them down. Abandoned geo-probe experiment = old `br-field-probe*` US configs (removed).

**PoP preflight is mandatory** — outside `expectedPop` → **409 contaminated**.

Ops run the survey **from local** against deployed Api (prefer preview/workers.dev).

## Auth

Auth0 Bearer with **`submit` or `curate`** (SPA action token is enough). Optional staging M2M credentials are a convenience for scripts only — not required by the route:

```
CULT_API_BEARER=...   # preferred for SPA tokens
# or CULT_AUTH0_M2M_CLIENT_ID / SECRET + audience/issuer in local-secrets.preview.env
```

## Legs

| Leg | Path | Purpose |
|-----|------|---------|
| `azure` | Azure `SubmitUrl/prepare` | Can UK Azure extract? Reports full meta field coverage. |
| `cfFetch` | Api Worker `catalogHtmlPrepare` → Azure `extract` | Edge fetch + extract meta coverage |
| `cfBr` | Api `browserRenderingHtml` → Azure `extract` | **Hydration only** (ITVX-class) — not geo |
| `cfUsFetch` | `SCRAPE_US` + **directHttp** → Azure `extract` | **Geo soft-wall** (Hulu/Peacock) — **never BR**; includes contract URL rewrite + meta coverage |

Each successful HTML leg posts Azure extract and reports `metaComplete` plus per-field presence for: `title`, `podcastName`, `description`, `publisher`, `image`, `duration`, `release`.

Response rows include **`prefer`** (Azure-first this run), **`recommend`** (contract technique), and **`geoFallback`**. When `assumedTechnique` is `scrapeUsFetch` and the US leg succeeds, `recommend` stays `scrapeUsFetch` even if Azure also returned a title.

## Prerequisites

1. Api with the survey route deployed (api-preview via PR Builds).
2. For `-IncludeUsFetch`: product Worker `streaming-scrape-us-preview` already deployed and bound as `SCRAPE_US` (`npm run deploy:scrape-us:preview` when needed — not part of the survey script).

## Run

```powershell
npm run survey:streaming-scrape -- `
  -ApiBaseUrl https://api-preview.jonbreen.workers.dev `
  -SecretsFile ./scripts/local-secrets.preview.env `
  -ExpectedEdgeLocs GB `
  -ExpectedEdgeColos LHR `
  -IncludeUsFetch `
  -ExpectedUsColos IAD
```

Prefer **colo** for US (`IAD`) — US scrape can report `loc=GB` with `colo=IAD`.

After success, compare runs automatically → `out/survey-contract-drift.md`. Alone:

```powershell
npm run survey:compare-contract
```

## Contaminated

Exit code `2` / HTTP 409 — do **not** trust results; fix PoP expectations or retry.

## Strategy for new plugins

**MUST** use survey `recommend` when adding a service — see
[`.cursor/skills/streaming-scrape-survey/SKILL.md`](../../.cursor/skills/streaming-scrape-survey/SKILL.md)
and [`.cursor/skills/add-streaming-service/SKILL.md`](../../.cursor/skills/add-streaming-service/SKILL.md).

## Specimens

[`survey-urls.json`](./survey-urls.json)

## Related

- [`docs/streaming-scrape-findings.md`](../../docs/streaming-scrape-findings.md)
- [`docs/workers-builds-deploy.md`](../../docs/workers-builds-deploy.md)
- [`workers/streaming-scrape-us/README.md`](../../workers/streaming-scrape-us/README.md)
