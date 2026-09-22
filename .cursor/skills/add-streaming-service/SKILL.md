---
name: add-streaming-service
description: >-
  Extend Api streaming-submit-contract when adding a new streaming ServiceKey.
  Use with RedditPodcastPoster add-streaming-service skill for full plugin work,
  or when the user asks to add a streaming service / scraper / new *.tv URL /
  create-scraping-service. Strategy MUST come from the streaming scrape survey.
---

# Add streaming service (Api)

Api owns the **wire-key contract**. Full plugin procedure lives in sibling RPP skill:

`cultpodcasts/RedditPodcastPoster/.cursor/skills/add-streaming-service/SKILL.md`

## When to use

- New streaming `ServiceKey` for submit lookup / prepare / membership
- User says add-streaming-service / create-scraping-service / support a new streamer URL

## HARD: survey decides prepare strategy

**Do not** guess `browserRendering`, US geo, or azurePrepare.

1. Read and follow [`.cursor/skills/streaming-scrape-survey/SKILL.md`](../streaming-scrape-survey/SKILL.md).
2. Add an enabled specimen to `scripts/streaming-scrape-survey/survey-urls.json`
   (`service`, deep-link `url`, provisional `assumedTechnique` if any).
3. Run the survey for that `-Service <key>` against **api-preview** (with `-IncludeUsFetch`
   unless you already know geo is irrelevant).
4. Set contract from **`recommend`** (see survey skill table). If recommend is `blocked`,
   stop — do not scaffold a false strategy.
5. After contract edits, `npm run survey:compare-contract` must be clean for that service
   (or the full matrix).

`streaming-scrape-us-preview` is the **product** preview twin for geo prepare (`SCRAPE_US`),
kept deployed like api-preview. Survey does not deploy or tear it down.

## Steps (this repo)

1. **Survey → strategy** (above). Confirm `key` + specimen URL.
   - `browserRendering` → add key to `defaultBrowserRenderingServices` **and** plan Worker
     secret `browserRenderingServices` under PR **`## Config / secrets`** for
     `api-preview` **and** top-level Worker **`api`** (names only).
   - `scrapeUsFetch` → `scrapeProfiles` entry `{ mode: "directHttp", region: "us" }`
     (binding `SCRAPE_US` → `streaming-scrape-us` / `streaming-scrape-us-preview`).
   - `azurePrepare` / `cfDirectHttp` → no US profile; not BR.
2. Edit `tests/fixtures/streaming-submit-contract.ts` and sibling `.json`:
   - Add the key to `streamingServiceKeys` and a matching specimen in `streamingSpecimenUrls`
   - Membership / orchestration case lists are **derived** (`flatMap` / `map` over
     `streamingServiceKeys`) — do **not** invent parallel hand-maintained arrays
   - Sync sibling `.json` from `streamingSubmitContractJsonPayload()` (or edit until
     `streaming-submit-contract.business-rules` passes — committed JSON must equal that payload)
   - Optionally before sibling copies:
     `npm test -- tests/streaming-submit-contract.business-rules.spec.ts`
3. Bump root `package.json` + `package-lock.json` **patch** (required on every Api PR).
   Workers Builds publishes `@cultpodcasts/streaming-submit-contract` (see
   [`docs/contract-publish.md`](../../docs/contract-publish.md)).
4. Prefer consumers take the package (`@latest` / `@staging`). Until then, copy JSON to RPP:
   `RedditPodcastPoster/docs/contracts/streaming-submit-contract.json`
5. Copy TS to website: `website/cultpodcasts/src/app/streaming-submit-contract.ts`
6. Run sibling asserts (from those repos) if still on copies:
   - `pwsh ./scripts/assert-streaming-submit-contract-copy.ps1`
7. If `browserRenderingServices` must include the new key: PR body **`## Config / secrets`**
   for `api-preview` **and** top-level Worker **`api`** (names only).
   For contract publish: Builds secret `NODE_AUTH_TOKEN` on both Workers Builds projects
   (not a runtime Worker secret).

## Safety

- Never `wrangler deploy` / `npm run deploy` unless user names that exact deploy
- Survey may run `deploy:scrape-us:preview` / delete — that is intentional and scoped
- Do not invent website/RPP enums — extend this fixture, then re-copy
- Never commit ad-hoc BR probe trees (`scripts/br-*-probe/`) or `*.wipbak` scratch files
- Never encode geo soft-walls as Browser Rendering

## Related

- `.cursor/skills/streaming-scrape-survey/SKILL.md`
- `docs/streaming-submit-orchestration.md`
- `.cursor/rules/preview-production-secrets-parity.mdc`
