/**
 * Azure-vs-D1 search parity harness.
 *
 * Sends identical POST bodies to the production Azure AI Search index
 * (read-only) and the deployed D1 lookalike endpoint, then measures agreement
 * and explains every difference:
 *
 *   - counts both sides, full id-set containment (Azure ⊆ D1? D1 ⊆ Azure?)
 *   - every Azure hit missing from D1 is classified:
 *       not_in_corpus | tokenization (text present, FTS missed) | unexplained
 *   - D1 extras are classified:
 *       description_truncation | guests_field | search_terms | other_field
 *   - top-10 rank overlap, facet bucket agreement
 *
 * Env (names only, never committed):
 *   RedditPodcastPoster_searchIndex__Url / __Key / __IndexName   Azure (read-only)
 *   SEARCH_DEMO_URL          D1 endpoint base (default workers.dev)
 *   SEARCH_API_KEY           D1 endpoint api-key (falls back to ../.dev.vars)
 *   CLOUDFLARE_D1_DEPLOY_TOKEN + ACCOUNT/DB ids   raw SQL for explanations
 *
 * Run: node search-demo/harness/run.mjs [--out report.md] [--free-text-only]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { odataUseCases, freeTextQueries, syntaxQueries } from "./cases.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const azUrl = env("RedditPodcastPoster_searchIndex__Url").replace(/\/+$/, "");
const azKey = env("RedditPodcastPoster_searchIndex__Key");
const azIndex = env("RedditPodcastPoster_searchIndex__IndexName");
const d1Base = (process.env.SEARCH_DEMO_URL ?? "https://search-demo.jonbreen.workers.dev").replace(/\/+$/, "");
const d1ApiKey = process.env.SEARCH_API_KEY ?? devVar("SEARCH_API_KEY");
const cfToken = env("CLOUDFLARE_D1_DEPLOY_TOKEN");
const cfAccount = process.env.CF_ACCOUNT_ID ?? "bae3f835f19899c6eee1ec48f2d658cf";
const cfDb = process.env.CF_D1_DB_ID ?? "f0162450-027a-46d8-af02-c771384534c7";

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

function devVar(name) {
  const text = readFileSync(join(here, "..", ".dev.vars"), "utf8");
  const m = new RegExp(`^${name}=(.+)$`, "m").exec(text);
  if (!m) throw new Error(`${name} not in env or .dev.vars`);
  return m[1].trim();
}

async function azure(body) {
  const res = await fetch(`${azUrl}/indexes/${azIndex}/docs/search?api-version=2024-07-01`, {
    method: "POST",
    headers: { "api-key": azKey, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 200 ? await res.json() : await res.text() };
}

async function d1(body) {
  const res = await fetch(`${d1Base}/indexes/d1/docs/search?api-version=2024-07-01`, {
    method: "POST",
    headers: { "api-key": d1ApiKey, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 200 ? await res.json() : await res.text() };
}

async function sql(query, params = []) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccount}/d1/database/${cfDb}/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfToken}`, "content-type": "application/json" },
    body: JSON.stringify({ sql: query, params }),
  });
  const body = await res.json();
  if (!body.success) throw new Error("d1 sql: " + JSON.stringify(body.errors));
  return body.result[0].results;
}

const ID_CAP = 10000;

/** All Azure ids for a body (paged; capped at ID_CAP). */
async function azureIds(body, cap = ID_CAP) {
  const ids = [];
  for (let skip = 0; skip < cap; skip += 1000) {
    const r = await azure({ ...body, top: 1000, skip, select: "id", facets: [] });
    if (r.status !== 200) return { error: r.body };
    ids.push(...r.body.value.map((v) => v.id));
    if (r.body.value.length < 1000) break;
  }
  return { ids };
}

/** All D1 ids for a body (via the endpoint's own translators, paged, select=id). */
async function d1Ids(body, cap = ID_CAP) {
  const ids = [];
  for (let skip = 0; skip < cap; skip += 1000) {
    const r = await d1({ ...body, top: 1000, skip, select: "id", facets: [] });
    if (r.status !== 200) return { error: r.body };
    ids.push(...r.body.value.map((v) => v.id));
    if (r.body.value.length < 1000) break;
  }
  return { ids };
}

const tokensOf = (q) =>
  (q ?? "")
    .toLowerCase()
    .replace(/["+|*]|(^|\s)-/g, " ")
    .split(/\s+/)
    .filter((t) => t && !["and", "or", "not"].includes(t));

/** Why is an Azure hit absent from the D1 result? */
async function explainAzureMissing(id, searchText) {
  const rows = await sql(
    "SELECT title, series_name, description, guests, search_terms, " + // pragma: allowlist secret
      "(SELECT GROUP_CONCAT(subject, ' ') FROM doc_subjects s WHERE s.rowid_ref = d.rowid) AS subj " + // pragma: allowlist secret
      "FROM search_docs d WHERE d.id = ?",
    [id]
  );
  if (!rows.length) return "not_in_corpus";
  const hay = Object.values(rows[0]).filter(Boolean).join(" ").toLowerCase();
  const toks = tokensOf(searchText);
  if (toks.length && toks.some((t) => hay.includes(t))) return "tokenization";
  return "unexplained";
}

/** Why did D1 find a doc Azure did not? */
async function explainD1Extra(id, searchText) {
  const rows = await sql(
    "SELECT title, series_name, substr(description,1,100) AS desc_head, substr(description,101) AS desc_tail, guests, search_terms, " + // pragma: allowlist secret
      "(SELECT GROUP_CONCAT(subject, ' ') FROM doc_subjects s WHERE s.rowid_ref = d.rowid) AS subj " + // pragma: allowlist secret
      "FROM search_docs d WHERE d.id = ?",
    [id]
  );
  if (!rows.length) return "missing_doc";
  const r = rows[0];
  const toks = tokensOf(searchText);
  const inField = (f) => toks.some((t) => (f ?? "").toLowerCase().includes(t));
  if (inField(r.guests)) return "guests_field";
  if (inField(r.desc_tail) && !inField(r.desc_head) && !inField(r.title) && !inField(r.series_name) && !inField(r.subj))
    return "description_truncation";
  if (inField(r.search_terms)) return "search_terms";
  return "other_field";
}

function topOverlap(a, b, n = 10) {
  const aa = a.slice(0, n);
  const bb = new Set(b.slice(0, n));
  return aa.filter((x) => bb.has(x)).length;
}

async function runCase(name, body, { explain = true } = {}) {
  const [az, dd] = await Promise.all([azure(body), d1(body)]);
  const out = { name, search: body.search, filter: body.filter, azStatus: az.status, d1Status: dd.status };
  if (az.status !== 200 || dd.status !== 200) {
    out.error = { azure: az.status !== 200 ? String(az.body).slice(0, 200) : undefined, d1: dd.status !== 200 ? String(dd.body).slice(0, 200) : undefined };
    return out;
  }
  out.azCount = az.body["@odata.count"] ?? az.body.value.length;
  out.d1Count = dd.body["@odata.count"] ?? dd.body.value.length;

  const [azSet, d1Set] = await Promise.all([azureIds(body), d1Ids(body)]);
  if (azSet.error || d1Set.error) {
    out.error = { azureIds: azSet.error, d1Ids: d1Set.error };
    return out;
  }
  const d1IdSet = new Set(d1Set.ids);
  const azIdSet = new Set(azSet.ids);
  const azMissing = azSet.ids.filter((id) => !d1IdSet.has(id));
  const d1Extra = d1Set.ids.filter((id) => !azIdSet.has(id));
  out.idsCompared = { azure: azSet.ids.length, d1: d1Set.ids.length, capped: azSet.ids.length >= ID_CAP || d1Set.ids.length >= ID_CAP };
  if (out.idsCompared.capped) {
    // The id sets are different windows of a >ID_CAP result; per-id diffing
    // would mis-classify pagination as tokenization. Compare counts only.
    out.azureMissingFromD1 = null;
    out.d1ExtraOverAzure = null;
    out.top10Overlap = topOverlap(az.body.value.map((v) => v.id), dd.body.value.map((v) => v.id));
    return out;
  }
  out.azureMissingFromD1 = azMissing.length;
  out.d1ExtraOverAzure = d1Extra.length;
  out.top10Overlap = topOverlap(az.body.value.map((v) => v.id), dd.body.value.map((v) => v.id));

  if (explain && azMissing.length) {
    const reasons = {};
    for (const id of azMissing.slice(0, 15)) {
      const why = await explainAzureMissing(id, body.search);
      reasons[why] = (reasons[why] ?? 0) + 1;
      if (why !== "not_in_corpus" && !out.azMissingSamples) out.azMissingSamples = [];
      if (why !== "not_in_corpus" && out.azMissingSamples.length < 3) out.azMissingSamples.push({ id, why });
    }
    out.azMissingReasons = reasons;
  }
  if (explain && d1Extra.length) {
    const reasons = {};
    for (const id of d1Extra.slice(0, 15)) {
      const why = await explainD1Extra(id, body.search);
      reasons[why] = (reasons[why] ?? 0) + 1;
    }
    out.d1ExtraReasons = reasons;
  }

  if ((body.facets ?? []).length) {
    const azF = az.body["@search.facets"] ?? {};
    const d1F = dd.body["@search.facets"] ?? {};
    out.facets = {};
    for (const key of Object.keys(azF)) {
      const a = azF[key] ?? [];
      const d = d1F[key] ?? [];
      const aTop = a.slice(0, 5).map((x) => `${x.value}:${x.count}`);
      const dTop = d.slice(0, 5).map((x) => `${x.value}:${x.count}`);
      out.facets[key] = { match: JSON.stringify(aTop) === JSON.stringify(dTop), azureTop5: aTop, d1Top5: dTop };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
const freeTextOnly = process.argv.includes("--free-text-only");
const outIdx = process.argv.indexOf("--out");
const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : join(here, "report.md");

const sampleRow = await sql("SELECT id FROM search_docs d WHERE d.series_name = 'Surviving Scientology' LIMIT 1");
const sampleId = sampleRow[0]?.id ?? (await sql("SELECT id FROM search_docs LIMIT 1"))[0].id;

const freeTextBody = (q) => ({
  search: q, filter: "", searchMode: "any", queryType: "simple", count: true, skip: 0, top: 20, facets: [], orderby: "",
});

const results = [];
if (!freeTextOnly) {
  for (const c of odataUseCases) {
    const body = c.body ?? c.bodyFromSample(sampleId);
    results.push(await runCase(c.name, body));
    process.stderr.write(".");
  }
}
for (const q of freeTextQueries) {
  results.push(await runCase(`free text: ${q}`, freeTextBody(q)));
  process.stderr.write(".");
}
if (!freeTextOnly) {
  for (const q of syntaxQueries) {
    results.push(await runCase(`syntax: ${q}`, freeTextBody(q)));
    process.stderr.write(".");
  }
}
process.stderr.write("\n");

// ---------------------------------------------------------------------------
const lines = [];
lines.push(`# Azure vs D1 parity report — ${new Date().toISOString()}`);
lines.push("");
lines.push(`Cases: ${results.length}. "az-missing" = Azure hits absent from D1 (regression candidates); "d1-extra" = D1 hits Azure lacks (usually the epic's benefit).`);
lines.push("");
lines.push("| case | azure | d1 | az-missing | d1-extra | top10 | az-missing reasons | d1-extra reasons |");
lines.push("|---|---|---|---|---|---|---|---|");
const fmt = (o) => (o ? Object.entries(o).map(([k, v]) => `${k}:${v}`).join(" ") : "");
let regressions = 0;
for (const r of results) {
  if (r.error) {
    lines.push(`| ${r.name} | ERR ${r.azStatus} | ERR ${r.d1Status} | | | | ${JSON.stringify(r.error).slice(0, 120)} | |`);
    continue;
  }
  const realMissing = Object.entries(r.azMissingReasons ?? {}).filter(([k]) => k !== "not_in_corpus").reduce((s, [, v]) => s + v, 0);
  if (realMissing) regressions++;
  const capped = r.idsCompared?.capped;
  lines.push(
    `| ${r.name} | ${r.azCount} | ${r.d1Count} | ${capped ? "capped" : r.azureMissingFromD1 ?? 0} | ${capped ? "capped" : r.d1ExtraOverAzure ?? 0} | ${r.top10Overlap ?? ""}/10 | ${fmt(r.azMissingReasons)} | ${fmt(r.d1ExtraReasons)} |`
  );
}
lines.push("");
const facetCases = results.filter((r) => r.facets);
if (facetCases.length) {
  lines.push("## Facets");
  for (const r of facetCases) {
    for (const [k, f] of Object.entries(r.facets)) {
      lines.push(`- ${r.name} / ${k}: ${f.match ? "MATCH" : "DIFF"} azure=${f.azureTop5.join(", ")} | d1=${f.d1Top5.join(", ")}`);
    }
  }
  lines.push("");
}
const samples = results.filter((r) => r.azMissingSamples?.length);
if (samples.length) {
  lines.push("## Azure hits missing from D1 (non-corpus) — investigate");
  for (const r of samples) for (const s of r.azMissingSamples) lines.push(`- ${r.name}: ${s.id} (${s.why})`);
  lines.push("");
}
lines.push(`## Summary: ${regressions} case(s) with Azure hits missing from D1 for non-corpus reasons.`);

writeFileSync(outPath, lines.join("\n"));
writeFileSync(outPath.replace(/\.md$/, ".json"), JSON.stringify(results, null, 1));
console.log(lines.join("\n"));
