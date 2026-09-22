---
name: add-streaming-service
description: >-
  Extend Api streaming-submit-contract when adding a new streaming ServiceKey.
  Use with RedditPodcastPoster add-streaming-service skill for full plugin work,
  or when the user asks to add a streaming service / scraper / new *.tv URL.
---

# Add streaming service (Api)

Api owns the **wire-key contract**. Full plugin procedure lives in sibling RPP skill:

`cultpodcasts/RedditPodcastPoster/.cursor/skills/add-streaming-service/SKILL.md`

## When to use

- New streaming `ServiceKey` for submit lookup / prepare / membership
- User says add-streaming-service / support a new streamer URL

## Steps (this repo)

1. Confirm `key`, specimen URL, and whether BR / geo is needed (`directHttp` + `region: default` by default).
   - If BR is required **without** a geo pin: add the key to `defaultBrowserRenderingServices` in
     `tests/fixtures/streaming-submit-contract.ts` (see `itvx` pattern) **and** plan
     Worker secret `browserRenderingServices` under PR **`## Config / secrets`** for
     `api-preview` **and** top-level Worker **`api`** (names only; step 7).
   - If the host is geo-walled (e.g. US-only catalogue): add a `scrapeProfiles` entry with
     `mode` + `region` (`us` / later `uk` / `de`). Phase 1 US scrape Worker is
     `workers/streaming-scrape-us` via Api binding `SCRAPE_US` — do not pin the main Api Worker.
2. Edit `tests/fixtures/streaming-submit-contract.ts` and sibling `.json`:
   - Add the key to `streamingServiceKeys` and a matching specimen in `streamingSpecimenUrls`
   - Membership / orchestration case lists are **derived** (`flatMap` / `map` over
     `streamingServiceKeys`) — do **not** invent parallel hand-maintained arrays
   - Sync sibling `.json` from `streamingSubmitContractJsonPayload()` (or edit until
     `streaming-submit-contract.business-rules` passes — committed JSON must equal that payload)
   - Optionally before sibling copies:
     `npm test -- tests/streaming-submit-contract.business-rules.spec.ts`
3. Bump root `package.json` + `package-lock.json` **patch** (required on every Api PR).
4. Copy JSON to RPP: `RedditPodcastPoster/docs/contracts/streaming-submit-contract.json`
5. Copy TS to website: `website/cultpodcasts/src/app/streaming-submit-contract.ts`
6. Run sibling asserts (from those repos):
   - `pwsh ./scripts/assert-streaming-submit-contract-copy.ps1`
7. If `browserRenderingServices` must include the new key: PR body **`## Config / secrets`**
   for `api-preview` **and** top-level Worker **`api`** (names only).

## Safety

- Never `wrangler deploy` / `npm run deploy` unless user names that exact deploy
- Do not invent website/RPP enums — extend this fixture, then re-copy
- Never commit ad-hoc BR probe trees (`scripts/br-*-probe/`) or `*.wipbak` scratch files
- Regional scrape Workers are separate from Api; Phase 1 is US only (`streaming-scrape-us`)

## Related

- `docs/streaming-submit-orchestration.md` (Browser Rendering + regional scrape)
- `.cursor/rules/preview-production-secrets-parity.mdc`
