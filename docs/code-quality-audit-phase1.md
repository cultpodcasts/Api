# Api Worker — Phase 1 Identify (code quality audit)

**Project:** C — Cloudflare Api Worker (`C:\Users\jonbr\source\repos\Api`)  
**Scope:** Identify only (no Wave 1–3 implementation)  
**Date:** 2026-07-22  
**Scorecard:** `value = (prod_risk × change_frequency × confidence_gain) / effort` (factors 1–5 integers)

---

## Hypotheses confirmed / refuted

| Plan hypothesis | Verdict | Evidence |
|-----------------|---------|----------|
| ~26 near-identical Azure proxy handlers | **Confirmed** (~26 Azure `getEndpoint`/`fetch` proxy handlers; 28 files with Azure/Search fetch including `search.ts` + `getPageDetails.ts`) | Pattern repeated across e.g. `src/updateEpisode.ts`, `src/submitDiscovery.ts`, `src/getDiscoveryReports.ts`, `src/deleteEpisode.ts`, …; shared `LogCollector` + `AddResponseHeaders` + permission check + `fetch` + status branch + generic 500/403 |
| Zero tests | **Confirmed** | No `*.test.ts` / `*.spec.ts`; `package.json` has only `deploy` + `start` (no `test` / `lint`) |
| `AddResponseHeaders` Allow-Methods bug | **Confirmed** | `src/AddResponseHeaders.ts:20` — `x.toUpperCase` missing `()`; joins function objects into header value |
| `LogCollector` ASN typo | **Confirmed** | `src/LogCollector.ts:50` — `hasOwnProperty('asn)')` (extra `)`); ASN from `collectRequest` never applied via `add()` |
| 401 vs 403 inconsistency | **Confirmed** | Most auth failures → **403** + `"Unauthorised"`; R2 list handlers (`getSubjects`, `getFlairs`, `getLanguages`, `getDiscoveryInfo`, `getPeople`) → **401**; OpenAPI `authResponses` documents **403** as `"Unauthorized"` (`src/openapiRoutes.ts:78-82`); docs gate uses 403 for both missing auth and non-admin (`src/index.ts:131-134`) |
| Analytics Engine bound but unused | **Confirmed** | Binding in `wrangler.jsonc` (all envs) + `Env.Analytics`; **no** `writeDataPoint` / `c.env.Analytics` usage in `src/` |
| Dual Old/New episode routes | **Confirmed** | `src/index.ts:277-289` registers both `/episode/:podcast…` and `/episode/:id` families |
| Secrets plaintext in set-secret scripts | **Confirmed** | `scripts/set-secrets-production.ps1` (and preview twin) embed Azure Search `apikey`, Auth0 client id, and endpoint URLs in-repo |
| `compatibility_date` stale (`2024-09-02`) | **Confirmed** | `wrangler.jsonc:6` |

---

## TOP 10 findings (ranked by value)

| # | lens | finding | evidence path(s) | prod_risk | change_freq | confidence_gain | effort | value | wave | fix type |
|---|------|---------|------------------|-----------|---------------|-----------------|--------|-------|------|----------|
| 1 | missing behavior tests | **No behavior-test harness** — zero route/contract tests; critical gateway journeys unguarded | `package.json` (no test script); repo-wide absence of `*.test.ts`/`*.spec.ts`; journeys below | 5 | 5 | 5 | 3 (M) | **41.7** | 2 | Add Vitest + `@cloudflare/vitest-pool-workers`; first suite for auth/CORS/discovery/status/bookmarks/submit |
| 2 | badly written | **`AddResponseHeaders` Allow-Methods bug** — `toUpperCase` not invoked; ACA-Methods header garbage on responses that use this helper | `src/AddResponseHeaders.ts:20`; callers pass `methods: [...]` across proxies/R2/homepage | 3 | 2 | 5 | 1 (S) | **30.0** | 1 | One-line fix `x.toUpperCase()` (+ assert header); note Hono `corsOptions` already lists methods correctly for preflight |
| 3 | badly written | **Most Azure proxies collapse non-success to generic 500** — loses 400/404/409 from Azure (esp. discovery-curation GET/POST only accept 200) | `src/submitDiscovery.ts:26-33`; `src/getDiscoveryReports.ts:28-35`; ~22× `return c.json({ error: "Error" }, 500)`; contrast: `src/publicGetEpisode.ts:28-33` and `src/getEpisode.ts:30-33` forward 404 | 4 | 4 | 5 | 3 (M) | **26.7** | 2 | Status allowlist / forward mapping inside shared proxy helper; cover with Vitest |
| 4 | badly written | **401 vs 403 (and OpenAPI labels) inconsistent** — same “Unauthorised” meaning; clients cannot rely on status | 403: majority of proxies + bookmarks; 401: `src/getSubjects.ts:36`, `src/getFlairs.ts:36`, `src/getLanguages.ts:36`, `src/getDiscoveryInfo.ts:42`, `src/getPeople.ts:113`; OpenAPI: `src/openapiRoutes.ts:78-82`; docs: `src/index.ts:131-134` | 3 | 4 | 4 | 2 (S) | **24.0** | 1 | Normalize: 401 unauthenticated / 403 missing permission; align OpenAPI `authResponses` |
| 5 | tech debt | **No `test` / `lint` scripts** — no CI gate for Worker quality | `package.json:5-8` | 2 | 3 | 4 | 1 (S) | **24.0** | 2 | Add `test`/`lint` scripts with Vitest (+ eslint/tsc); wire CI when harness exists |
| 6 | tech debt | **Secrets plaintext in set-secret scripts** — Azure Search API key and Auth0 client id checked into git | `scripts/set-secrets-production.ps1`; `scripts/set-secrets-preview.ps1` (+ `.cmd` wrappers) | 5 | 2 | 4 | 2 (S) | **20.0** | 1 | Remove secrets from repo; load from Key Vault / env / `wrangler secret` interactive; rotate Search key |
| 7 | badly written | **`LogCollector` ASN never recorded** — typo `'asn)'` breaks `hasOwnProperty` check | `src/LogCollector.ts:50-52`; set path `src/LogCollector.ts:11` | 2 | 2 | 4 | 1 (S) | **16.0** | 1 | Fix key to `'asn'`; assert in unit test |
| 8 | code smells | **~26 copy-paste Azure proxy handlers** — permission + fetch + status + logging duplicated; `any` JSON bodies | 26 proxy modules under `src/*` using `getEndpoint`/`buildFetchHeaders`; `data: any` in update/create/submit handlers; dual episode handlers in `src/getEpisode.ts`, `src/updateEpisode.ts`, `src/deleteEpisode.ts` | 3 | 5 | 4 | 4 (L) | **15.0** | 3 | Extract `proxyToAzure({ permission, endpoint, expectedStatuses })`; retire old episode routes after client cutover |
| 9 | unused framework features | **Workers modernization gap** — Analytics Engine bound unused; Vitest Workers pool not adopted; `compatibility_date` stuck at `2024-09-02` | `src/Env.ts:28`; `wrangler.jsonc` `analytics_engine_datasets` + `compatibility_date`; no vitest deps in `package.json` | 2 | 3 | 4 | 3 (M) | **8.0** | 2 | Adopt Vitest pool (with finding #1); either use Analytics or drop binding; bump compatibility_date deliberately |
| 10 | code smells | **Weak OpenAPI contracts (`z.any`) + dual Old/New episode surface** — docs/schemas don’t constrain bodies; two episode URL families to maintain | `src/openapiRoutes.ts:68-76` (`genericOkSchema` / `jsonBodySchema`); `src/index.ts:277-289` | 2 | 4 | 3 | 3 (M) | **8.0** | 3 | Tighten Zod schemas incrementally; deprecate old `/episode/:id` after Angular uses new routes |

**Scoring notes**

- Finding #2: Hono `cors` middleware (`src/corsOptions.ts`) already handles OPTIONS correctly; the bug still pollutes `Access-Control-Allow-Methods` on many non-preflight responses.
- Finding #8 effort **L** because safe extraction depends on Wave 2 status/auth tests (#1, #3).
- Effort column: numeric 1–5 used in formula; parenthetical S/M/L is planning size.

---

## Additional confirmed issues (outside top 10, for Phase 2 merge)

| Issue | Evidence | Notes |
|-------|----------|-------|
| `pushSubscription` may throw if JWT has no `permissions` | `src/pushSubscription.ts:14` — `auth0Payload.permissions.includes` without `?.` | Unauthenticated path OK; malformed payload → unhandled error |
| Auth0 middleware never returns 401 on invalid/missing JWT | `src/Auth0Middleware.ts:13-26` — sets empty `auth0` callback and `next()` | Failures deferred to handlers (403/401 mix) |
| OpenAPI docs auth: missing token labeled Unauthorised **403** | `src/index.ts:127-131` | Same 401/403 theme |
| `publicGetEpisode` requires Auth0 payload despite “public” path | `src/publicGetEpisode.ts:17-42`; route `auth: true` in `openapiRoutes.ts` | Name vs gate mismatch — cover in auth matrix |

---

## Vitest Workers pool — journey map

Target stack: **Vitest** + **`@cloudflare/vitest-pool-workers`** (plan Project C). No tests exist today; this is the Wave 2 harness backlog.

| Journey | Risk if broken | Suggested cases | Primary files |
|---------|----------------|-----------------|---------------|
| **Auth permission matrix** | High — curation/admin/submit leakage or lockout | No bearer → 401 (after normalize); valid JWT missing scope → 403; `curate` / `admin` / `submit` allow respective routes; invalid JWT does not elevate; docs `/openapi.json` requires admin | `Auth0Middleware.ts`, handlers’ `permissions.includes`, `openapiRoutes.ts` `auth: true`, `index.ts` docs gate |
| **CORS allowlist** | High — browser client blocked or overly open | Allowed origins (`AllowedOrigins` + `stagingHostSuffix`) reflected; disallowed origin falls back to primary allowlist origin; preflight `OPTIONS` allows GET/POST/PUT/DELETE + `authorization`; credentials true | `corsOptions.ts`, `getOrigin.ts`, `AllowedOrigins.ts`, `index.ts` `app.use('/*', cors(...))` |
| **Discovery-curation GET/POST status forwarding** | High — curator UI treats Azure 4xx as Worker 500 | GET `/discovery-curation` with `curate`: Azure 200 body forwarded; Azure 4xx/5xx **not** remapped to opaque 500 (today they are); POST `/discovery-curation` same; query string forwarded on GET | `getDiscoveryReports.ts`, `submitDiscovery.ts`, `endpoints.ts` |
| **Status forwarding (episode / public)** | Medium-High — bookmarks/UI miss vs hard fail | `GET /public/episode/:id` forwards **404**; `GET /episode/...` forwards **404**; non-404 failures → controlled error; regression: do not reintroduce 500-for-404 | `publicGetEpisode.ts`, `getEpisode.ts` |
| **Bookmarks Durable Object** | High — user profile data wrong/lost | Authed `sub`: add → 200; duplicate → 409; invalid UUID → 400; get empty user → `[]` 200; delete missing → documented status; unauth → 401/403 per policy | `addBookmark.ts`, `deleteBookmark.ts`, `getBookmarks.ts`, `ProfileDurableObject.ts` |
| **Submit Azure-vs-D1 fallback** | High — lost submissions or wrong success | `submit` scope + Azure 200 → body + `X-Origin: true`; Azure non-200 → D1 insert success; missing/invalid URL → 400; Prisma unique/error → 400; unauth without Azure success still D1 path (document intended behavior) | `submit.ts` |

### Suggested first Vitest file set (Wave 2)

1. `tests/auth-matrix.spec.ts`
2. `tests/cors.spec.ts`
3. `tests/discovery-curation.spec.ts`
4. `tests/status-forwarding.spec.ts`
5. `tests/bookmarks-do.spec.ts`
6. `tests/submit-fallback.spec.ts`

---

## Proposed wave assignment (Api-only preview)

| Wave | Theme | Findings |
|------|--------|----------|
| **1** | Quick wins / proven bugs | #2 Allow-Methods `()`, #4 401/403 normalize, #6 secrets out of repo (+ rotate), #7 ASN typo |
| **2** | Behavior-test harness + status contracts | #1 Vitest pool, #5 test/lint scripts, #3 status forwarding, #9 compatibility/Analytics decision |
| **3** | Structural | #8 `proxyToAzure` helper, #10 OpenAPI schemas + deprecate old episode routes |

---

## Method / lens coverage checklist

| Lens | Covered by finding # |
|------|----------------------|
| 1. Code smells | 8, 10 |
| 2. Technical debt | 5, 6 |
| 3. Badly written | 2, 3, 4, 7 |
| 4. Unused framework features | 9 (Analytics unused; Vitest pool missing; stale compatibility_date) |
| 5. Missing behavior tests | 1 (+ journey map) |
