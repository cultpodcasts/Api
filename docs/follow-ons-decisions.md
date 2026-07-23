# Api Worker — follow-on decisions

Short decision notes for Wave 2+ code-quality items that need an explicit choice before implementation.

---

## Analytics Engine binding (2026-07-23)

**Current state:** `analytics_engine_datasets` with binding `Analytics` is declared in `wrangler.jsonc` (default + `local` / `preview` / `production` envs). `Env.Analytics: AnalyticsEngineDataset` is typed in `src/Env.ts`. **No** `writeDataPoint` or other runtime usage exists under `src/`.

**Observability already enabled:** `wrangler.jsonc` sets `"observability": { "enabled": true }`, which covers Workers Logs / tracing for production debugging without a custom Analytics Engine dataset.

**Recommendation: drop the binding (do not add usage yet).**

| Option | Pros | Cons |
|--------|------|------|
| **Drop binding** (recommended) | Removes dead config and unused `Env` surface; one less binding to reason about in local/preview/prod | If product later wants custom SQL analytics (e.g. per-route latency histograms), binding must be re-added |
| Add `writeDataPoint` usage | Custom queryable metrics in AE SQL | Needs schema design, sampling, PII review, and ongoing cost; duplicates what App Insights / Workers observability already provide for this gateway |

**Action when approved:** Remove `analytics_engine_datasets` blocks from all envs in `wrangler.jsonc` and remove `Analytics` from `Env.ts`. No deploy urgency — binding is inert today.

---

## `compatibility_date` (2026-07-23)

**Current value:** `2024-09-02` (`wrangler.jsonc:6`)

**Proposed value (if bumping deliberately):** `2026-01-01` or latest stable date at time of intentional Workers-runtime review — **not** auto-bumped in this wave.

**Recommendation: leave at `2024-09-02` for now; schedule a deliberate bump with a test pass.**

| Factor | Assessment |
|--------|------------|
| Risk of staying | Low — worker uses Hono, JWT, R2, D1, DO; no exotic runtime flags pinned to newer dates |
| Risk of bumping | Medium — compatibility date gates runtime bugfixes and API behaviour changes; a jump of ~18 months can alter fetch, crypto, or streaming semantics |
| When to bump | After a dedicated regression pass (`npm test`, manual smoke of auth/CORS/discovery/bookmarks/submit) on `wrangler dev` with candidate date |

**Do not bump** as part of unrelated schema/docs work. Treat as its own small PR with changelog review against [Workers compatibility dates](https://developers.cloudflare.com/workers/configuration/compatibility-dates/).
