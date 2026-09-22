# Streaming submit orchestration

Rules for **streaming** catalogue URL ingest across Cloudflare Worker (Api), Azure Functions (RedditPodcastPoster / api-infra), and the website. Podcast-service platforms (Spotify / Apple / YouTube) use their APIs and are **out of scope**.

## Canonical contract

| Artifact | Role |
|----------|------|
| [`tests/fixtures/streaming-submit-contract.ts`](../tests/fixtures/streaming-submit-contract.ts) | Source of truth (TypeScript) |
| [`tests/fixtures/streaming-submit-contract.json`](../tests/fixtures/streaming-submit-contract.json) | Same payload for RPP / tooling |
| **GitHub Packages** `@cultpodcasts/streaming-submit-contract` | **Deferred** (billing) — see [`contract-publish.md`](./contract-publish.md). Until unblocked, use sibling byte-copies. |
| Website / RPP copies | Canonical consumers until Packages is enabled |

Prefer sibling contract copies until Packages publish is unblocked. Do **not** wire Builds to `deploy:*:with-contract`.

Legacy assert copies (sibling checkouts):

```powershell
# website git root
pwsh ./scripts/assert-streaming-submit-contract-copy.ps1

# RedditPodcastPoster git root
pwsh ./scripts/assert-streaming-submit-contract-copy.ps1
```

Do **not** invent a parallel streamer enum or membership shape on the website or in RPP docs. Extend the Api fixture, then re-copy siblings (and publish later when Packages is unblocked).

## Wire enums (stable strings)

| Name | Values | Notes |
|------|--------|-------|
| `kind` | `podcast-service` \| `streaming` \| `unrecognised` | Coarse membership class |
| `service` | `ServiceKeys` streaming keys (`itvx`, `discoveryPlus`, `bbcSounds`, …) | On streaming membership only |
| `htmlFetchMode` | `directHttp` \| `browserRendering` | Prepare-time fetch policy |
| `scrapeRegions` | `default` \| `us` \| `uk` \| `de` | Where prepare HTML fetch runs (`default` = Api Worker) |
| `scrapeProfiles` | per-service `{ mode, region }` | Canonical mode + region (Phase 1: `hulu` / `peacock` → US) |
| `prepareUrlRewrites` | per-service `{ fromPathPrefix, toPathPrefix, … }` | Rewrite soft-wall catalogue paths before regional scrape (Phase 1: Peacock `/watch/asset` → `/watch-online`) |

TypeScript: const arrays + derived union types in the contract fixture.  
.NET: `ServiceKeys` / `UrlMembershipLookupKinds` must stay aligned with the JSON `streamingServiceKeys` list (RPP business-rule test).

## Process (happy path, unknown streaming URL)

1. **`GET /submit/lookup`** — Cosmos membership + classify URL → `{ known, kind: "streaming", service }`. **No page scrape. No Browser Rendering.**
2. **`POST /submit/prepare`** — Worker classifies via lookup, then applies **Azure-first** fetch policy (below). Caches meta in `StreamMeta` KV (`stream-meta:v1:<url>`, 15m TTL).
3. **`POST /submit`** — Worker injects trusted `prefetchedMeta` from KV when present; Azure skips page fetch on cache hit.

Direction: **SPA → CF → Azure** (and CF → Browser Rendering / regional scrape Workers only when required). Azure does **not** call Cloudflare. **Episode extraction always runs on Azure** (`SubmitUrl/prepare` or `SubmitUrl/extract`); Cloudflare only acquires HTML/JSON Azure cannot.

### Azure-first HTML policy

| Path | Who fetches | Who extracts | Use when |
|------|-------------|--------------|----------|
| **Default** | Azure | Azure `SubmitUrl/prepare` | Azure UK can load episode meta (most services, including **ZDF**) |
| **CF GET / API** | Worker | Azure `SubmitUrl/extract` | Azure cannot reach host (Tubi GET, BitChute video API) |
| **CF Browser Rendering** | Worker (edge) | Azure extract | **SPA hydration** (ITVX) — BR is **not** region-pinnable; never for geo |
| **CF regional fetch** | `streaming-scrape-us` via `SCRAPE_US` (`directHttp`) | Azure extract | **Geo soft-wall** (Hulu / Peacock) |

Known marketing / geo soft-wall shells (Hulu → Disney+, Peacock → signin) are rejected before extract.

Field evidence: [`streaming-scrape-findings.md`](./streaming-scrape-findings.md).

**Re-verify anytime:** `npm run survey:streaming-scrape` → `POST /ops/streaming-scrape-survey` (PoP preflight; **409 contaminated** if trace misses `expectedPop`). Ops: [`scripts/streaming-scrape-survey/README.md`](../scripts/streaming-scrape-survey/README.md).

## Membership response shapes (streaming)

Every streaming `service` must support:

| Arm | Shape |
|-----|--------|
| Known | `{ known: true, podcastId, podcastName, kind: "streaming", service }` |
| Unknown | `{ known: false, kind: "streaming", service }` (`podcastName` only after prepare/extract) |
| Ambiguous | `{ known: false, ambiguous: true, kind: "streaming", service, podcastIds }` (HTTP 200) |

Contract matrix: `streamingMembershipShapeCases` (service × arm).

## Browser Rendering allowlist + scrape profiles

- **Canonical:** contract `scrapeProfiles[service]` supplies both `mode` and `region`. Missing profile → `region: default` and mode from the BR allowlist.
- **Legacy overlay:** Worker secret `browserRenderingServices` (CSV of ServiceKeys) can force `browserRendering` without a website bump. Set via gitignored `scripts/local-secrets.*.env` + `.\scripts\set-secrets-preview.ps1` / `set-secrets-production.ps1`.
- Contract fixture `defaultBrowserRenderingServices` documents the recommended ops starting list for hosts without a profile (today: `itvx` on the edge Api Worker).
- Empty secret → profiles still apply; hosts without a profile use `directHttp`.

### Regional scrape Workers (geo)

One Worker can have only one [`placement.region`](https://developers.cloudflare.com/workers/configuration/placement/). Api stays at the edge; Phase 1 adds US scrape Workers (`placement.region: aws:us-east-1`) reached via service binding **`SCRAPE_US`**:

| Api | `SCRAPE_US` → |
|-----|----------------|
| Top-level **`api`** | **`streaming-scrape-us`** |
| **`api-preview`** | **`streaming-scrape-us-preview`** |

Same repo (`workers/streaming-scrape-us`); **separate** Workers Builds / deploys from Api. Preview must not bind production scrape. When `scrapeProfiles[service].region === "us"` (Hulu / Peacock: **`directHttp`**), prepare POSTs `{ url, mode }` over `SCRAPE_US` and uses the returned HTML before Azure extract. Prefer **fetch** for geo; Browser Run is not region-pinnable. Services with `prepareUrlRewrites` (Peacock) rewrite the fetch URL **once** inside `scrapeViaRegionalWorker` via contract `resolvePrepareFetchUrl` — prepare and survey share that path.

Ops: [`workers/streaming-scrape-us/README.md`](../workers/streaming-scrape-us/README.md).

**Do not** add `SCRAPE_DE` for ZDF HTML meta. Further regional Workers only for geo **fetch** soft-walls with PoP preflight on surveys.

### BR navigate wait (ITVX / SPA)

Prepare uses Cloudflare Browser Rendering (`src/browserRenderingHtml.ts`) for allowlisted services (default: `itvx`). Before `goto`, BR applies a desktop Chrome User-Agent (`DESKTOP_CHROME_UA`) and 1280×720 viewport — required so catalogue SPAs (e.g. ITVX) load instead of hanging on `about:blank`. `page.goto` waits for **`domcontentloaded`** (20s timeout, 40s hard cap), then a short settle (~1.5s) before `page.content()`. On goto timeout or hard-cap, prepare still salvages `page.content()` when possible, logs marks / document status / challenge hints, and continues to Azure extract only if the HTML looks usable (`og:title` or `__NEXT_DATA__`, length ≥ 500, and not a challenge/interstitial page). Bare `<title>` alone is not enough.

Do **not** use `networkidle0` here: ITVX and similar catalogue SPAs keep long-poll/analytics sockets open, so network-idle often never settles and prepare surfaces as a 45s BR timeout / 502 even when the DOM is already extractable.

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
