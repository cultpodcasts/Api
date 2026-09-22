# Streaming scrape findings (Sep 2026)

Ops / architecture notes. Prefer **Azure extract**; Cloudflare only when required. **BR is not region-pinnable** — geo soft-walls use placed **Worker fetch**, not Browser Run.

## Decision rule (Azure-first)

| Prefer | When |
|--------|------|
| **Azure `SubmitUrl/prepare`** | Azure UK can load episode meta (most services, incl. **ZDF**) |
| **CF Worker `fetch` → Azure extract** | Azure cannot GET; edge Worker can (e.g. Tubi) |
| **CF Browser Rendering → Azure extract** | **SPA hydration** only (e.g. ITVX) — no geo claim |
| **CF regional scrape + `directHttp` → Azure extract** | **Geo soft-wall** (Peacock) via `SCRAPE_US` — **never BR for geo**. Preview Api → `streaming-scrape-us-preview`; production Api → `streaming-scrape-us`. Hulu is submit-retired (no usable episode catalogue pages). |

## Ongoing survey (Api-orchestrated)

`POST /ops/streaming-scrape-survey` on deployed Api. Isolates are ephemeral. **PoP preflight** (`cdn-cgi/trace`) must match `expectedPop` or the survey aborts **contaminated** (no catalogue rows).

```powershell
npm run survey:streaming-scrape -- `
  -ApiBaseUrl https://api-preview.jonbreen.workers.dev `
  -SecretsFile ./scripts/local-secrets.preview.env `
  -ExpectedEdgeLocs GB -ExpectedEdgeColos LHR `
  -IncludeUsFetch -ExpectedUsColos IAD
```

`-IncludeUsFetch` requires the product Worker **`streaming-scrape-us-preview`** already
deployed (survey does not ensure/teardown it). Compare to contract:
`npm run survey:compare-contract`. Skill: [`.cursor/skills/streaming-scrape-survey/SKILL.md`](../.cursor/skills/streaming-scrape-survey/SKILL.md).

See [`scripts/streaming-scrape-survey/README.md`](../scripts/streaming-scrape-survey/README.md).

| Leg | Meaning |
|-----|---------|
| azure | Azure prepare |
| cfFetch | Api edge fetch |
| cfBr | Api edge BR (**hydration**) |
| cfUsFetch | `SCRAPE_US` **directHttp** (**geo**) |

## Country PoP notes (legacy matrix)

Worker placement soft-pins the **Worker** isolate. BR pool affinity is unreliable (US often IAD; DE/CH BR missed). Do not use BR as a geo tool.

## Peacock (US scrape)

- Profile: `{ mode: "directHttp", region: "us" }` → `SCRAPE_US` fetch + marketing-shell reject + Azure extract. **Only** US `scrapeProfiles` entry.
- **Hulu retired from submit:** `/watch/{id}` redirects to series hub; public SEO episode pages do not exist. Enum/icon may remain for historical URLs.
- **Peacock prepare URLs:** US SEO `/watch-online/movies|tv/...` (Next.js SSR `title` / `og:*`). `/watch/asset/...` is the authenticated SPA and soft-walls to signin / browser-not-supported.
- **Rewrite:** contract `prepareUrlRewrites.peacock` (`/watch/asset/` → `/watch-online/`); applied once in `scrapeViaRegionalWorker` via `resolvePrepareFetchUrl` (prepare + survey). Playback `/watch/playback/vod/...` is not rewritten.
- Non-US / mis-placed fetch → `/unavailable` with title `Unavailable In Your Region` — marketing-shell reject.
- Spike (Sep 2026): `cfUsFetch` on real `/watch-online` movie + Office UK episode → `usable=true`, real titles; GraphQL/BFF not required for prepare meta.

## ZDF

Azure / edge fetch — no `SCRAPE_DE` for meta. DE only for playback.

## Techniques IN USE

| Technique | Services |
|-----------|----------|
| Azure prepare | Default (zdf, ard, netflix, …) |
| CF GET → extract | tubi |
| CF BitChute API → extract | bitchute |
| Edge BR → extract | itvx |
| US placed **fetch** → extract | peacock |
| Marketing shell reject | peacock, disneyPlus |

## Related

- [`streaming-submit-orchestration.md`](./streaming-submit-orchestration.md)
