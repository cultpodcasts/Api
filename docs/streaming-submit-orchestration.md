# Streaming submit orchestration

Rules for **streaming** catalogue URL ingest across Cloudflare Worker (Api), Azure Functions (RedditPodcastPoster / api-infra), and the website. Podcast-service platforms (Spotify / Apple / YouTube) use their APIs and are **out of scope**.

## Canonical contract

| Artifact | Role |
|----------|------|
| [`tests/fixtures/streaming-submit-contract.ts`](../tests/fixtures/streaming-submit-contract.ts) | Source of truth (TypeScript) |
| [`tests/fixtures/streaming-submit-contract.json`](../tests/fixtures/streaming-submit-contract.json) | Same payload for RPP / tooling |
| Website copy | `website/cultpodcasts/src/app/streaming-submit-contract.ts` (byte-identical) |
| RPP copy | `RedditPodcastPoster/docs/contracts/streaming-submit-contract.json` (byte-identical) |

Assert copies:

```powershell
# website git root
pwsh ./scripts/assert-streaming-submit-contract-copy.ps1

# RedditPodcastPoster git root
pwsh ./scripts/assert-streaming-submit-contract-copy.ps1
```

Do **not** invent a parallel streamer enum or membership shape on the website or in RPP docs. Extend the Api fixture, then re-copy.

## Wire enums (stable strings)

| Name | Values | Notes |
|------|--------|-------|
| `kind` | `podcast-service` \| `streaming` \| `unrecognised` | Coarse membership class |
| `service` | `ServiceKeys` streaming keys (`itvx`, `discoveryPlus`, `bbcSounds`, …) | On streaming membership only |
| `htmlFetchMode` | `directHttp` \| `browserRendering` | Prepare-time fetch policy |

TypeScript: const arrays + derived union types in the contract fixture.  
.NET: `ServiceKeys` / `UrlMembershipLookupKinds` must stay aligned with the JSON `streamingServiceKeys` list (RPP business-rule test).

## Process (happy path, unknown streaming URL)

1. **`GET /submit/lookup`** — Cosmos membership + classify URL → `{ known, kind: "streaming", service }`. **No page scrape. No Browser Rendering.**
2. **`POST /submit/prepare`** — Fetch HTML + extract meta; cache meta (KV). Fetch mode: if `service ∈ BROWSER_RENDERING_SERVICES` (Worker env) → Browser Rendering; else Azure `HttpClient`.
3. **`POST /submit`** — Ingest using cached `prefetchedMeta` when present; **no second page fetch** on cache hit.

Direction: **SPA → CF → Azure** (and CF → Browser Rendering). Azure does **not** call Cloudflare.

## Membership response shapes (streaming)

Every streaming `service` must support:

| Arm | Shape |
|-----|--------|
| Known | `{ known: true, podcastId, podcastName, kind: "streaming", service }` |
| Unknown | `{ known: false, kind: "streaming", service }` (`podcastName` only after prepare/extract) |
| Ambiguous | `{ known: false, ambiguous: true, kind: "streaming", service, podcastIds }` (HTTP 200) |

Contract matrix: `streamingMembershipShapeCases` (service × arm).

## Browser Rendering allowlist

- Runtime: Worker secret `browserRenderingServices` (CSV of ServiceKeys). **Not** hardcoded in `src/`.
- Set via gitignored `scripts/local-secrets.*.env` + `.\scripts\set-secrets-preview.ps1` / `set-secrets-production.ps1` (survives deploy).
- Contract fixture `defaultBrowserRenderingServices` documents the recommended ops starting list only.
- Empty secret → all streaming hosts use `directHttp`.

## Fakes and tests

| Repo | Enforcement |
|------|-------------|
| **Api** | Vitest business rules over fixture permutations; OpenAPI must eventually accept `service`; fake bodies from fixture |
| **website** | Vitest business rules consume copied TS; Playwright fake-api adapts fixture lookup-by-URL |
| **RPP** | Business rules: `ServiceCatalog.SearchEncodedKeys` ≡ JSON `streamingServiceKeys`; membership DTO/`service` when implemented |

## Anti-patterns

- Client-supplied HTML or meta on public submit bodies
- Azure invoking CF for HTML
- Parallel hand-maintained streamer lists in website regexes without contract sync
- Scraping on membership lookup (prepare owns fetch)
- Treating Spotify/Apple/YouTube as streaming `service` values in this contract

## Related

- Website UX flows: `website/cultpodcasts/docs/submit-url-flows.md`
- Actor/D1 submit cases: `tests/fixtures/submit-url-contract.ts` (unchanged ownership)
- Design canvases (workspace): `submit-url-itvx-vs-non-itvx`, `submit-url-sequence-diagrams`
