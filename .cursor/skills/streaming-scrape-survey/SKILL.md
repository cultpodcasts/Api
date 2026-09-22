---
name: streaming-scrape-survey
description: >-
  Run the Api-orchestrated streaming scrape survey against deployed api-preview,
  tear down streaming-scrape-us-preview afterward, and flag contract drift
  (scrapeProfiles / defaultBrowserRenderingServices vs survey recommend).
  Use when adding a streaming service, verifying prepare strategy, or when
  survey findings disagree with the contract.
---

# Streaming scrape survey (Api)

**Authority for prepare strategy.** Do not invent BR / US geo / azurePrepare for a
new `ServiceKey` from vibes — run this survey (or `-Service <key>` on a specimen)
and set contract + plugin from **`recommend`**.

## When to use

- Before / while **add-streaming-service** (required for strategy)
- Suspected prepare regression (hosts change)
- Audit: contract does not match last survey

## Prerequisites

| Need | Notes |
|------|--------|
| Deployed **api-preview** with `POST /ops/streaming-scrape-survey` | PR Builds; not localhost |
| Staging Auth0 **M2M** | `CULT_AUTH0_M2M_CLIENT_ID` / `SECRET` in gitignored `scripts/local-secrets.preview.env` (staging tenant `auth-staging…`) |
| Specimen URL | Add to `scripts/streaming-scrape-survey/survey-urls.json` when probing a new service |

**Never** leave `streaming-scrape-us-preview` running between surveys. `run-survey.ps1`
deploys it for `-IncludeUsFetch` and deletes it in `finally` (unless `-KeepScrapeWorker`).
Production `streaming-scrape-us` is product traffic — do not delete it for surveys.

## When starting (HARD)

Before (or as the first lines of) the survey run, confirm the preview scrape Worker was
**already stopped**. A live Worker means the **previous** survey/use failed to tear down.

1. `run-survey.ps1` prints this automatically; or run:

```powershell
npm run survey:scrape-us:assert-start
```

2. Interpret:
   - `SURVEY_WORKERS_START: CLEAN` — OK
   - `SURVEY_WORKERS_START: NOT_STOPPED` — **previous-run failure**; tell the user; survey may continue and should still tear down at the end
   - `SURVEY_WORKERS_START: UNKNOWN` — say verification failed; do not claim clean

3. Opening reply (or first status after kickoff) **must** state start status: clean **or**
   leftover from previous run.

## Run (full matrix)

```powershell
npm run survey:streaming-scrape -- `
  -ApiBaseUrl https://api-preview.jonbreen.workers.dev `
  -SecretsFile ./scripts/local-secrets.preview.env `
  -ExpectedEdgeLocs GB `
  -ExpectedEdgeColos LHR `
  -IncludeUsFetch `
  -ExpectedUsColos IAD
```

New service only:

```powershell
# add enabled target + assumedTechnique in survey-urls.json first
npm run survey:streaming-scrape -- `
  -ApiBaseUrl https://api-preview.jonbreen.workers.dev `
  -SecretsFile ./scripts/local-secrets.preview.env `
  -Service <key> `
  -ExpectedEdgeLocs GB -ExpectedEdgeColos LHR `
  -IncludeUsFetch -ExpectedUsColos IAD
```

Outputs (gitignored under `out/`):

- `survey-summary.md` / `.json`
- `survey-contract-drift.md` (unless `-SkipContractCompare`)

Manual scrape lifecycle:

```powershell
npm run survey:scrape-us:ensure
npm run survey:scrape-us:teardown
```

## Interpret `recommend` → contract

| `recommend` | Contract change |
|-------------|-----------------|
| `azurePrepare` | No US `scrapeProfiles`; not in `defaultBrowserRenderingServices` |
| `cfDirectHttp` | Edge fetch / default `directHttp` (no US pin; not BR) |
| `browserRendering` | Add to `defaultBrowserRenderingServices` (+ Worker secret plan) — **hydration only**, never geo |
| `scrapeUsFetch` | `scrapeProfiles[key] = { mode: "directHttp", region: "us" }` — **never BR for geo** |
| `blocked` | Do not ship; fix specimen or accept unsupported |

Azure-first: if `azure === true`, recommend is `azurePrepare` even when US fetch also works.

## Identify problems (drift)

After a successful survey, `compare-survey-to-contract.ps1` exits **1** when:

- Survey `recommend` ≠ technique implied by `scrapeProfiles` / `defaultBrowserRenderingServices`
- `assumedTechnique` in `survey-urls.json` ≠ `recommend`
- Geo encoded as BR (`scrapeUsFetch` + BR allowlist, or BR + `region: us`)

Re-run compare alone:

```powershell
npm run survey:compare-contract
```

**Act on drift:** update the fixture (`tests/fixtures/streaming-submit-contract.ts` + `.json`),
sync website/RPP copies, bump Api semver — or fix bad specimens / re-run survey.

## Before finishing (HARD)

After every survey run (success, contaminated, or failed), **confirm survey Workers
are stopped** and tell the user in the closing message.

1. Prefer the survey script’s final line:
   - `SURVEY_WORKERS: STOPPED (streaming-scrape-us-preview absent)` — good
   - `SURVEY_WORKERS: STILL_RUNNING …` — bad; tear down immediately
   - `SURVEY_WORKERS: KEPT_RUNNING (-KeepScrapeWorker)` — only OK if the user asked to keep it; remind them to tear down
2. If the log is unclear, run:

```powershell
npm run survey:scrape-us:assert-stopped
```

   Accept only `SURVEY_WORKERS: STOPPED`. Treat `UNKNOWN` or `STILL_RUNNING` as not stopped.
3. If still running and the user did **not** pass `-KeepScrapeWorker`:

```powershell
npm run survey:scrape-us:teardown
npm run survey:scrape-us:assert-stopped
```

4. Closing reply **must** state explicitly: survey Workers stopped **or** still running
   (and what you did). Do not end the turn without that confirmation.

Do **not** delete production `streaming-scrape-us`.

## Safety

- No Api / website `wrangler deploy` except `deploy:scrape-us:preview` via survey scripts
- Never commit M2M secrets or `out/`
- Contaminated (exit 2): ignore results; fix PoP (`ExpectedUsColos IAD`, not `loc=US`)
- Never leave `streaming-scrape-us-preview` running after the skill finishes (unless user asked `-KeepScrapeWorker`)

## Related

- `.cursor/skills/add-streaming-service/SKILL.md` — must use survey for strategy
- `docs/streaming-scrape-findings.md`
- `scripts/streaming-scrape-survey/README.md`
