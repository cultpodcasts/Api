# D1 search shadow soak: SLOs and dashboard (SP-3.2)

[RPP #1323](https://github.com/cultpodcasts/RedditPodcastPoster/issues/1323), epic
[RPP #1312](https://github.com/cultpodcasts/RedditPodcastPoster/issues/1312). This is the gate
before production `/search` moves from Azure AI Search to the D1 search Worker. The sync and
reconcile design is in RPP `docs/search-platform/sync-and-replication.md`. The sampler is
described in `workers/search/README.md` (`search shadow` log, SP-3.1, Api #228).

## What runs

- The api Worker samples **10%** of production `POST /search` requests
  (`wrangler.jsonc`: `searchShadowEnabled: "true"`, `searchShadowSampleRate: "0.1"`,
  `searchShadowTopN: "10"`). Preview and local stay off.
- Each sampled request sends the same rewritten body to the D1 search Worker over the `SEARCH`
  binding, on `ctx.waitUntil`. Azure is still the result users get, and their latency is unchanged.
- Each sample logs one line, `message = "search shadow"`, on the **`api`** Worker.
- **Kill switch:** set `searchShadowEnabled` to `"false"`, or the rate to `"0"`, and deploy from main.

## The soak

- **Length:** 7 consecutive days with every SLO met. Day 1 starts when the sampler is live in
  production.
- **Daily check:** evaluate each SLO once a day over the previous 24 hours, plus once over the
  whole 7 days at the end.
- **Any breach restarts the clock.** A breach is any SLO missed in a daily check, or a drift check
  above the limit. Fix the cause, then restart day 1.
- **Minimum sample:** a day with fewer than **200** `search shadow` samples, or fewer than **50**
  browse samples for the overlap SLO, has no verdict. It neither breaks nor extends the clock;
  the 7-day evaluation still has to pass.
- **Prerequisites:** these must be true before day 1, or day 1 is meaningless.
  - Production D1 is loaded, and a `D1SearchReconcile --full` dry run shows drift ≤ 0.5%.
  - The Functions push the index's changes to D1 (`d1SearchProductionEnabled` on in RPP
    `Infrastructure/functions.bicepparam`). Without the drip, D1 falls behind Azure during the soak,
    and counts and overlap degrade for reasons that have nothing to do with D1 search quality.

## SLOs

| # | SLO | Measured on | Pass |
|---|-----|-------------|------|
| 1 | Latency | `slo.bothOk = true` samples | D1 p95 `d1.latencyMs` ≤ Azure p95 `azure.latencyMs` **and** ≤ 300 ms |
| 2 | Availability | all samples | `slo.d1Unavailable = true` on ≤ 0.1% of samples |
| 3 | Result counts | samples with `slo.countWithin` present | `slo.countWithin = true` on ≥ 99% |
| 4 | Browse overlap | `queryKind = "browse"` samples with `slo.overlapOk` present | `slo.overlapOk = true` on ≥ 95% |
| 5 | Drift | the week's full reconcile | drift ≤ 0.5% |

**Per-sample verdicts.** Workers Observability can only compare a field with a constant, never
two fields with each other. So the sampler computes every Azure-vs-D1 comparison itself
(`shadowSlo()` in `src/searchShadow.ts`) and logs it as a field:

| Field | Type | Meaning |
|-------|------|---------|
| `queryKind` | string | `browse`: no free text (empty or `*`), so a podcast or subject listing. `text`: a typed search |
| `azure.latencyMs`, `d1.latencyMs` | number | Time from the api Worker to each engine's full answer, in ms. D1 is measured over the service binding |
| `azure.status`, `d1.status` | number | HTTP status (absent if the engine never answered) |
| `azure.count`, `d1.count` | number | `@odata.count` |
| `azure.cacheStatus` | string | Azure only: `cf-cache-status` of the edge-cached Azure call (`HIT`, `MISS`, …). D1 is never edge-cached |
| `overlap.matched` | number | How many of Azure's top 10 ids are also in D1's top 10 |
| `overlap.sameOrder` | boolean | The two top-10 lists are identical, in order |
| `slo.d1Ok` | boolean | D1 answered 200 with no error |
| `slo.d1Unavailable` | boolean | D1 answered 429 or 5xx, or not at all (the binding threw). A 4xx is a failure but not "unavailable" |
| `slo.bothOk` | boolean | Both engines answered 200. Only these samples carry the verdicts below |
| `slo.countDelta` | number | D1 count minus Azure count |
| `slo.countWithin` | boolean | \|countDelta\| ≤ max(2, 0.1% of the Azure count) |
| `slo.overlapNeeded` | number | min(9, number of Azure ids): 9 of the top 10 for a full page, all of a shorter list |
| `slo.overlapOk` | boolean | `overlap.matched ≥ slo.overlapNeeded` |

Nested fields are flattened with dots. That is how Workers Observability already indexes the
api Worker's `searchLog` object lines (for example `query.filter` and `errors.searchStatus`).

## Dashboard: saved queries

Save each one in **Workers & Pages → Observability → Query Builder** (Save query). Use the names
below and set the timeframe to the last 24 hours for the daily check, or the last 7 days for the
final one; 7 days is Workers Observability's maximum range. The JSON is the same query in the
Observability API / MCP shape (`view`, `parameters`), so it can also be run with the Cloudflare
observability tools. Every query filters to the production api Worker:

```json
{ "key": "$metadata.service", "operation": "eq", "type": "string", "value": "api" },
{ "key": "message", "operation": "eq", "type": "string", "value": "search shadow" }
```

These two filters are referred to as **BASE** below.

### 1. `soak 1 latency p95`

```json
{
  "view": "calculations",
  "parameters": {
    "filters": [BASE, { "key": "slo.bothOk", "operation": "eq", "type": "boolean", "value": true }],
    "calculations": [
      { "key": "azure.latencyMs", "keyType": "number", "operator": "p95", "alias": "azure_p95" },
      { "key": "d1.latencyMs", "keyType": "number", "operator": "p95", "alias": "d1_p95" },
      { "operator": "count", "alias": "samples" }
    ]
  }
}
```

**Pass:** `d1_p95 ≤ azure_p95` and `d1_p95 ≤ 300`.

**Diagnostic:** add a group-by on `azure.cacheStatus`. Azure answers from the edge cache on a
`HIT`, and D1 never does, so a failure driven by `HIT` samples is a cache effect, not D1 being
slower. The SLO is still judged over all samples, as agreed. If it fails only because of cache
hits, take that to Jon rather than changing the rule silently. After the switch, D1 answers
would sit behind the same cache.

### 2. `soak 2 availability`

```json
{
  "view": "calculations",
  "parameters": {
    "filters": [BASE],
    "calculations": [{ "operator": "count", "alias": "samples" }],
    "groupBys": [{ "type": "boolean", "value": "slo.d1Unavailable" }]
  }
}
```

**Pass:** `true / (true + false) ≤ 0.001`.

**Diagnostic:** to see what failed, change the group-by to `d1.status`, or list events with
`slo.d1Ok = false`. On the search Worker (`$metadata.service = "search"`), D1 failures log
`$metadata.message = "search: D1 failure"`.

### 3. `soak 3 counts`

```json
{
  "view": "calculations",
  "parameters": {
    "filters": [BASE, { "key": "slo.countWithin", "operation": "exists", "type": "boolean" }],
    "calculations": [{ "operator": "count", "alias": "samples" }],
    "groupBys": [{ "type": "boolean", "value": "slo.countWithin" }]
  }
}
```

**Pass:** `true / (true + false) ≥ 0.99`.

**Diagnostic:** list events with `slo.countWithin = false`, showing `query`, `filter` and
`slo.countDelta`. A steady positive delta means D1 is matching more than Azure: a tokenizer
or filter difference. A negative delta on new episodes means sync lag.

### 4. `soak 4 browse overlap`

```json
{
  "view": "calculations",
  "parameters": {
    "filters": [
      BASE,
      { "key": "queryKind", "operation": "eq", "type": "string", "value": "browse" },
      { "key": "slo.overlapOk", "operation": "exists", "type": "boolean" }
    ],
    "calculations": [{ "operator": "count", "alias": "samples" }],
    "groupBys": [{ "type": "boolean", "value": "slo.overlapOk" }]
  }
}
```

**Pass:** `true / (true + false) ≥ 0.95`.

**Diagnostic:** list events with `slo.overlapOk = false`, showing `filter` and `overlap.matched`.
Browse results are ordered by release date, so a miss is usually a missing or stale document
(sync) or a tie-break difference on the same release time.

Text queries are ranked differently by the two engines (BM25 versus Azure's scoring), so their
overlap is reported but is not an SLO. Run the same query with `queryKind = "text"` to watch it.

### 5. Drift (not in Workers Observability)

Drift comes from the Cosmos ↔ D1 reconcile, which runs in RPP, not in a Worker. Once a week,
Jon runs the console as a **dry run**:

```powershell
D1SearchReconcile --full
```

Read `drift x.xx%` from its summary line. **Pass:** ≤ 0.5%.

The Indexer's weekly timer (`D1SearchReconcile`, Sundays 04:30 UTC) logs the same line to
Application Insights, but only once `d1SearchProductionEnabled` is on. It stops at a 4.5-minute
budget, so a full pass may not finish there. Until a timer run is seen to complete, the console
run is the measurement. When it does run, this is the query:

```kusto
traces
| where timestamp > ago(7d)
| where message startswith "D1 search reconcile:"
| project timestamp, Outcome = tostring(customDimensions.Outcome), Drift = todouble(customDimensions.Drift),
          Missing = toint(customDimensions.Missing), Stale = toint(customDimensions.Stale),
          Orphans = toint(customDimensions.Orphans)
| order by timestamp desc
```

## Evaluating a day

1. Run queries 1–4 over the last 24 hours, and record the numbers on RPP #1323 (one comment a day).
2. If any query fails and has at least the minimum sample, that is a breach. Note it, fix it, and
   restart at day 1.
3. On day 7, run queries 1–4 over the last 7 days, and run the drift check. If all pass, the soak
   is over, and the production switch (Api #231/#232) can be scheduled with Jon.

## Known limits

- The search Worker's own lines (`search: d1 read`, `search: admin write`) are logged as
  `console.log(name, object)`. Workers Observability indexes only the name of such a line
  (`$metadata.message`), not the object's fields, so per-region D1 timings (`servedByRegion`,
  `sqlDurationMs`) cannot be charted today. None of the SLOs above need them.
- Latency is measured from the api Worker, so both engines include their network path. D1's
  path includes the service binding.
