# Streaming scrape findings (Sep 2026)

Ops / architecture notes. Prefer **Azure extract**; Cloudflare only when required. **BR is not region-pinnable** — geo soft-walls use placed **Worker fetch**, not Browser Run.

## Decision rule (Azure-first)

| Prefer | When |
|--------|------|
| **Azure `SubmitUrl/prepare`** | Azure UK can load episode meta (most services, incl. **ZDF**) |
| **CF Worker `fetch` → Azure extract** | Azure cannot GET; edge Worker can (e.g. Tubi) |
| **CF Browser Rendering → Azure extract** | **SPA hydration** only (e.g. ITVX) — no geo claim |
| **CF regional scrape + `directHttp` → Azure extract** | **Geo soft-wall** (Hulu / Peacock) via `SCRAPE_US` — **never BR for geo**. Preview Api → `streaming-scrape-us-preview`; production Api → `streaming-scrape-us`. |

## Ongoing survey (Api-orchestrated)

`POST /ops/streaming-scrape-survey` on deployed Api. Isolates are ephemeral. **PoP preflight** (`cdn-cgi/trace`) must match `expectedPop` or the survey aborts **contaminated** (no catalogue rows).

```powershell
npm run survey:streaming-scrape -- `
  -ApiBaseUrl https://api-preview.jonbreen.workers.dev `
  -SecretsFile ./scripts/local-secrets.preview.env `
  -ExpectedEdgeLocs GB -ExpectedEdgeColos LHR `
  -IncludeUsFetch -ExpectedUsLocs US
```

See [`scripts/streaming-scrape-survey/README.md`](../scripts/streaming-scrape-survey/README.md).

| Leg | Meaning |
|-----|---------|
| azure | Azure prepare |
| cfFetch | Api edge fetch |
| cfBr | Api edge BR (**hydration**) |
| cfUsFetch | `SCRAPE_US` **directHttp** (**geo**) |

## Country PoP notes (legacy matrix)

Worker placement soft-pins the **Worker** isolate. BR pool affinity is unreliable (US often IAD; DE/CH BR missed). Do not use BR as a geo tool.

## Hulu / Peacock

- Profile: `{ mode: "directHttp", region: "us" }` → `SCRAPE_US` fetch + marketing-shell reject + Azure extract.
- Peacock may still soft-wall to signin after fetch — shell reject; need public meta URL/API.

## ZDF

Azure / edge fetch — no `SCRAPE_DE` for meta. DE only for playback.

## Techniques IN USE

| Technique | Services |
|-----------|----------|
| Azure prepare | Default (zdf, ard, netflix, …) |
| CF GET → extract | tubi |
| CF BitChute API → extract | bitchute |
| Edge BR → extract | itvx |
| US placed **fetch** → extract | hulu, peacock |
| Marketing shell reject | hulu, peacock, disneyPlus |

## Related

- [`streaming-submit-orchestration.md`](./streaming-submit-orchestration.md)
