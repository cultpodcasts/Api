# Streaming scrape survey — Api-orchestrated (ephemeral isolates)

Hosts change. Re-run when prepare regresses or before changing `scrapeProfiles`.

**No permanent probe Workers.** Survey is `POST /ops/streaming-scrape-survey` on deployed **Api**.
**`streaming-scrape-us-preview`** is deployed only for the survey run (`-IncludeUsFetch`) and
**deleted afterward** unless `-KeepScrapeWorker`. Production `streaming-scrape-us` stays up for live geo prepare.

**PoP preflight is mandatory** — outside `expectedPop` → **409 contaminated**.

Ops run the survey **from local** against deployed Api (prefer preview/workers.dev).

## Auth

Auth0 Bearer with **`submit` or `curate`** (staging M2M for api-preview). Put in gitignored secrets:

```
CULT_AUTH0_M2M_CLIENT_ID=...
CULT_AUTH0_M2M_CLIENT_SECRET=...
```

(plus `auth0Audience` / `auth0Issuer` already in `local-secrets.preview.env`)

## Legs

| Leg | Path | Purpose |
|-----|------|---------|
| `azure` | Azure `SubmitUrl/prepare` | Can UK Azure extract? |
| `cfFetch` | Api Worker `catalogHtmlPrepare` | Edge fetch |
| `cfBr` | Api `browserRenderingHtml` | **Hydration only** (ITVX-class) — not geo |
| `cfUsFetch` | `SCRAPE_US` + **directHttp** | **Geo soft-wall** (Hulu-class) — **never BR** |

## Prerequisites

1. Api with the survey route deployed (api-preview via PR Builds).
2. For `-IncludeUsFetch`: script deploys/tears down scrape preview — no manual step.

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

End of every run prints `SURVEY_WORKERS: STOPPED` or `STILL_RUNNING`. Start of every run
prints `SURVEY_WORKERS_START: CLEAN` or `NOT_STOPPED` (leftover = previous teardown failure).

```powershell
npm run survey:scrape-us:assert-start
npm run survey:scrape-us:assert-stopped
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
