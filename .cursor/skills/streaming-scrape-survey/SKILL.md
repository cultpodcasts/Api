---
name: streaming-scrape-survey
description: >-
  Run the Api-orchestrated streaming scrape survey against deployed api-preview
  and flag contract drift (scrapeProfiles / defaultBrowserRenderingServices vs
  survey recommend). Use when adding a streaming service, verifying prepare
  strategy, or when survey findings disagree with the contract.
---

# Streaming scrape survey (Api)

**Authority for prepare strategy.** Do not invent BR / US geo / azurePrepare for a
new `ServiceKey` from vibes — run this survey (or `-Service <key>` on a specimen)
and set contract + plugin from **`recommend`** (not `prefer`).

## When to use

- Before / while **add-streaming-service** (required for strategy)
- Suspected prepare regression (hosts change)
- Audit: contract does not match last survey

## Prerequisites

| Need | Notes |
|------|--------|
| Deployed **api-preview** with `POST /ops/streaming-scrape-survey` | PR Builds; not localhost |
| Auth0 Bearer with **submit or curate** | SPA token via `CULT_API_BEARER`, or optional staging M2M in gitignored `scripts/local-secrets.preview.env` |
| Specimen URL | Add to `scripts/streaming-scrape-survey/survey-urls.json` when probing a new service |
| **streaming-scrape-us-preview** for `-IncludeUsFetch` | Product preview twin — keep deployed (`npm run deploy:scrape-us:preview`). Survey does **not** deploy/teardown it. |

Survey = Api route only (ephemeral isolates). Abandoned experiment = old `br-field-probe*` US probes.

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

## Interpret `recommend` → contract

Rows expose **`prefer`** (Azure-first this run), **`recommend`** (contract technique), and **`geoFallback`**.

| `recommend` | Contract change |
|-------------|-----------------|
| `azurePrepare` | No US `scrapeProfiles`; not in `defaultBrowserRenderingServices` |
| `cfDirectHttp` | Edge fetch / default `directHttp` (no US pin; not BR) |
| `browserRendering` | Add to `defaultBrowserRenderingServices` (+ Worker secret plan) — **hydration only**, never geo |
| `scrapeUsFetch` | `scrapeProfiles[key] = { mode: "directHttp", region: "us" }` — **never BR for geo** |
| `blocked` | Do not ship; fix specimen or accept unsupported |

When `assumedTechnique` is `scrapeUsFetch` and `cfUsFetch` succeeds, **`recommend` stays `scrapeUsFetch`** even if `prefer` is `azurePrepare` (deliberate geo fallback — do not flip the contract from intermittent Azure success).

## Identify problems (drift)

After a successful survey, `compare-survey-to-contract.ps1` exits **1** when:

- Survey `recommend` ≠ technique implied by `scrapeProfiles` / `defaultBrowserRenderingServices`
- `assumedTechnique` in `survey-urls.json` ≠ `recommend`
- Assumed geo but `cfUsFetch` failed (profile not validated this run)
- Geo encoded as BR (`scrapeUsFetch` + BR allowlist, or BR + `region: us`)

Re-run compare alone:

```powershell
npm run survey:compare-contract
```

**Act on drift:** update the fixture (`tests/fixtures/streaming-submit-contract.ts` + `.json`),
sync website/RPP copies, bump Api semver — or fix bad specimens / re-run survey.

## Safety

- No Api / website `wrangler deploy` unless the user names that exact deploy
- Never commit secrets or `out/`
- Contaminated (exit 2): ignore results; fix PoP (`ExpectedUsColos IAD`, not `loc=US`)
- Do **not** delete production `streaming-scrape-us` or the preview twin for survey hygiene

## Related

- `.cursor/skills/add-streaming-service/SKILL.md` — must use survey for strategy
- `docs/streaming-scrape-findings.md`
- `scripts/streaming-scrape-survey/README.md`
