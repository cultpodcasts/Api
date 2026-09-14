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

1. Confirm `key`, specimen URL, and whether BR is needed (`directHttp` default).
2. Edit `tests/fixtures/streaming-submit-contract.ts` and sibling `.json`:
   - `streamingServiceKeys`
   - `streamingSpecimenUrls`
   - membership / orchestration case coverage (fixture helpers)
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

## Related

- `docs/streaming-submit-orchestration.md`
- `.cursor/rules/preview-production-secrets-parity.mdc`
