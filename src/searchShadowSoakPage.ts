import type { Context } from "hono";
import type { Env } from "./Env";
import {
	loadSoakReport,
	missingSoakConfig,
	SOAK_COUNT_WITHIN_MIN,
	SOAK_DAYS,
	SOAK_DRIFT_MAX,
	SOAK_LATENCY_MAX_MS,
	SOAK_MIN_BROWSE_SAMPLES,
	SOAK_MIN_SAMPLES,
	SOAK_OVERLAP_MIN,
	SOAK_RAG_COUNT_WITHIN_AMBER,
	SOAK_RAG_LATENCY_MARGIN_MS,
	SOAK_RAG_LATENCY_RATIO,
	SOAK_RAG_OVERLAP_AMBER,
	SOAK_RAG_UNAVAILABLE_AMBER,
	SOAK_UNAVAILABLE_MAX,
	SoakQueryError,
	type Rag,
	type SoakLatency,
	type SloResult,
	type SoakDay,
	type SoakReport,
	type SoakSource,
	type Verdict
} from "./searchShadowSoak";
import { renderChart, type ChartSeries } from "./soakCharts";

export { SEARCH_SHADOW_SOAK_PATH } from "./searchShadowSoak";

export const SOAK_DOC_URL = "https://github.com/cultpodcasts/Api/blob/main/docs/search-shadow-soak.md";
const DRIFT_DOC_URL = `${SOAK_DOC_URL}#5-drift-not-in-workers-observability`;

export function soakSourceFromEnv(env: Env, fetcher?: typeof fetch): SoakSource {
	return {
		accountId: env.cloudflareAccountId,
		token: env.cfAnalyticsReadToken,
		dataset: env.searchShadowAnalyticsDataset,
		fetcher
	};
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

const pct = (v: number | null, digits = 2) => (v === null ? "–" : `${(v * 100).toFixed(digits)}%`);
const ms = (v: number | null) => (v === null ? "–" : `${Math.round(v)} ms`);
const int = (v: number) => Math.round(v).toLocaleString("en-GB");

function badge(verdict: Verdict, label?: string): string {
	const text = label ?? (verdict === "pass" ? "pass" : verdict === "fail" ? "fail" : "no verdict");
	return `<span class="v v-${verdict}">${escapeHtml(text)}</span>`;
}

function rag(value: Rag, label?: string): string {
	return `<span class="rag rag-${value}" title="${value}">${escapeHtml(label ?? value.toUpperCase())}</span>`;
}

function sloCell(result: SloResult, value: string): string {
	return `<td class="cell-${result.rag}">${value}<br><small>n=${int(result.samples)}</small> ${badge(result.verdict)} ${rag(result.rag)}</td>`;
}

type RowKind = "day" | "today" | "week";

function row(d: SoakDay, label: string, kind: RowKind): string {
	const lat = d.latency;
	return `<tr${kind === "day" ? "" : ` class="${kind}"`}>
<th scope="row">${escapeHtml(label)}</th>
<td>${int(d.counts.samples)}<br><small>browse ${int(d.counts.browseSamples)}</small></td>
<td class="cell-${lat.rag}">D1 ${ms(lat.d1P95)} / Azure ${ms(lat.azureP95)}<br><small>p50 D1 ${ms(lat.d1P50)} / Azure ${ms(lat.azureP50)} · n=${int(lat.samples)}</small> ${badge(lat.verdict)} ${rag(lat.rag)}</td>
${sloCell(d.availability, `${pct(d.availability.value, 3)}<br><small>timeouts ${int(d.counts.timeouts)}</small>`)}
${sloCell(d.countAgreement, pct(d.countAgreement.value))}
${sloCell(d.browseOverlap, pct(d.browseOverlap.value))}
<td><a href="${DRIFT_DOC_URL}">manual</a></td>
<td class="cell-${d.rag}">${kind === "today" ? `${badge("no-verdict", "in progress")} ${rag(d.rag, "provisional")}` : `${badge(d.verdict)} ${rag(d.rag)}`}</td>
</tr>`;
}

function page(body: string, environment?: string): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Search shadow soak${environment ? ` (${escapeHtml(environment)})` : ""}</title>
<style>
body { font: 14px system-ui, sans-serif; margin: 24px; color: #111827; }
table { border-collapse: collapse; margin: 16px 0; }
th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; vertical-align: top; }
thead th { background: #f3f4f6; }
tr.today { color: #6b7280; }
tr.week { font-weight: 600; background: #f9fafb; }
small { color: #6b7280; }
.v { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 12px; font-weight: 600; }
.v-pass { background: #dcfce7; color: #166534; }
.v-fail { background: #fee2e2; color: #991b1b; }
.v-no-verdict { background: #e5e7eb; color: #374151; }
.rag { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; }
.rag-green { background: #16a34a; color: #fff; }
.rag-amber { background: #f59e0b; color: #111827; }
.rag-red { background: #dc2626; color: #fff; }
td.cell-green { border-left: 4px solid #16a34a; }
td.cell-amber { border-left: 4px solid #f59e0b; }
td.cell-red { border-left: 4px solid #dc2626; }
.summary { display: flex; gap: 16px; align-items: center; padding: 12px 16px; border-radius: 8px; margin: 12px 0; }
.summary-green { background: #dcfce7; } .summary-amber { background: #fef3c7; } .summary-red { background: #fee2e2; }
.summary .big { font-size: 28px; font-weight: 700; }
.summary dl { display: grid; grid-template-columns: auto auto; gap: 2px 12px; margin: 0; }
.summary dt { color: #4b5563; } .summary dd { margin: 0; font-weight: 600; }
.charts { display: flex; flex-wrap: wrap; gap: 16px; }
figure.chart { margin: 0; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; }
figure.chart svg { max-width: 100%; height: auto; }
figcaption { font-size: 12px; color: #374151; text-align: center; }
nav a { margin-right: 12px; }
</style>
</head>
<body>
<nav><a href="/docs">← API docs</a><a href="${SOAK_DOC_URL}">Soak runbook</a><a href="/docs/logout">Logout</a></nav>
<h1>D1 search shadow soak</h1>
${body}
</body>
</html>`;
}

const STATUS_LABEL = { "not-started": "not started", "in-progress": "in progress", breached: "breached", passed: "passed" } as const;

function summaryBlock(report: SoakReport): string {
	const s = report.summary;
	return `<section class="summary summary-${s.rag}" aria-label="Soak summary">
<div>${rag(s.rag, `D1 vs Azure: ${s.rag.toUpperCase()}`)}<div class="big">Day ${s.day} of ${SOAK_DAYS}</div></div>
<dl>
<dt>Verdict</dt><dd>${escapeHtml(STATUS_LABEL[s.status])}: ${escapeHtml(s.headline)}</dd>
<dt>Consecutive green days</dt><dd>${report.streak} of ${SOAK_DAYS}</dd>
<dt>Last ${SOAK_DAYS} days</dt><dd>${badge(report.week.verdict)} ${rag(report.week.rag)}</dd>
<dt>Latest complete day</dt><dd>${report.days[1] ? `${escapeHtml(report.days[1].day)} ${badge(report.days[1].verdict)} ${rag(report.days[1].rag)}` : "–"}</dd>
</dl>
</section>`;
}

const AZURE = "#2563eb";
const D1 = "#ea580c";
const latencySeries = (items: SoakLatency[]): ChartSeries[] => [
	{ name: "Azure p95", color: AZURE, values: items.map((i) => i.azureP95) },
	{ name: "D1 p95", color: D1, values: items.map((i) => i.d1P95) },
	{ name: "Azure p50", color: AZURE, dashed: true, values: items.map((i) => i.azureP50) },
	{ name: "D1 p50", color: D1, dashed: true, values: items.map((i) => i.d1P50) }
];

/** All charts, oldest day first. */
export function renderSoakCharts(report: SoakReport): string {
	const days = [...report.days].reverse();
	const labels = days.map((d) => d.day.slice(5));
	const msFmt = (v: number) => `${Math.round(v)} ms`;
	const pctFmt = (digits: number) => (v: number) => `${(v * 100).toFixed(digits)}%`;
	const latencyCeiling = { value: SOAK_LATENCY_MAX_MS, label: `${SOAK_LATENCY_MAX_MS} ms ceiling` };
	const charts = [
		renderChart({
			title: "Daily latency p50 / p95 (both engines answered)",
			labels,
			series: latencySeries(days.map((d) => d.latency)),
			thresholds: [latencyCeiling],
			format: msFmt
		}),
		report.hours.length
			? renderChart({
					title: "Today by hour (UTC): latency p50 / p95",
					labels: report.hours.map((h) => `${h.hour}h`),
					series: latencySeries(report.hours.map((h) => h.latency)),
					thresholds: [latencyCeiling],
					format: msFmt
				})
			: "",
		renderChart({
			title: "D1 availability: unavailable share and timeouts",
			labels,
			series: [
				{ name: "Unavailable %", color: D1, values: days.map((d) => d.availability.value) },
				{ name: "Timeouts %", color: "#7c3aed", dashed: true, values: days.map((d) => (d.counts.samples > 0 ? d.counts.timeouts / d.counts.samples : null)) }
			],
			thresholds: [
				{ value: SOAK_UNAVAILABLE_MAX, label: "0.1% limit" },
				{ value: SOAK_RAG_UNAVAILABLE_AMBER, label: "amber", color: "#d97706" }
			],
			format: pctFmt(2)
		}),
		renderChart({
			title: "Result counts within tolerance",
			labels,
			series: [{ name: "Counts agree %", color: D1, values: days.map((d) => d.countAgreement.value) }],
			thresholds: [
				{ value: SOAK_COUNT_WITHIN_MIN, label: "99% limit" },
				{ value: SOAK_RAG_COUNT_WITHIN_AMBER, label: "amber", color: "#d97706" }
			],
			yMin: 0.9,
			yMax: 1,
			format: pctFmt(1)
		}),
		renderChart({
			title: "Browse overlap (9 of Azure's top 10 in D1's)",
			labels,
			series: [{ name: "Overlap ok %", color: D1, values: days.map((d) => d.browseOverlap.value) }],
			thresholds: [
				{ value: SOAK_OVERLAP_MIN, label: "95% limit" },
				{ value: SOAK_RAG_OVERLAP_AMBER, label: "amber", color: "#d97706" }
			],
			yMin: 0.8,
			yMax: 1,
			format: pctFmt(0)
		}),
		renderChart({
			title: "Samples per day",
			labels,
			series: [
				{ name: "All samples", color: "#6b7280", kind: "bar", values: days.map((d) => d.counts.samples) },
				{ name: "Browse (overlap)", color: "#0d9488", kind: "bar", values: days.map((d) => d.counts.browseSamples) }
			],
			thresholds: [
				{ value: SOAK_MIN_SAMPLES, label: `${SOAK_MIN_SAMPLES} minimum`, color: "#6b7280" },
				{ value: SOAK_MIN_BROWSE_SAMPLES, label: `${SOAK_MIN_BROWSE_SAMPLES} browse minimum`, color: "#0d9488" }
			]
		}),
		renderChart({
			title: "Azure edge cache HIT vs MISS: p95 latency",
			labels,
			series: [
				{ name: "Azure HIT", color: AZURE, values: days.map((d) => report.cache.get(d.day)?.HIT.azureP95 ?? null) },
				{ name: "Azure MISS", color: AZURE, dashed: true, values: days.map((d) => report.cache.get(d.day)?.MISS.azureP95 ?? null) },
				{ name: "D1 (HIT samples)", color: D1, values: days.map((d) => report.cache.get(d.day)?.HIT.d1P95 ?? null) },
				{ name: "D1 (MISS samples)", color: D1, dashed: true, values: days.map((d) => report.cache.get(d.day)?.MISS.d1P95 ?? null) }
			],
			format: msFmt
		})
	];
	return `<section class="charts" aria-label="Charts">${charts.join("")}</section>`;
}

export function renderSoakReport(report: SoakReport, environment?: string): string {
	const [today, ...complete] = report.days;
	const rows = [row(today, `${today.day} (today, UTC)`, "today"), ...complete.map((d) => row(d, d.day, "day"))].join("\n");
	const body = `${summaryBlock(report)}
<p><small>Generated ${escapeHtml(report.generatedAt)}. Days are UTC. A day passes only when SLOs 1–4 all pass; any fail breaks the streak; a day with fewer than ${SOAK_MIN_SAMPLES} samples (or fewer than ${SOAK_MIN_BROWSE_SAMPLES} browse samples for overlap) has no verdict and neither breaks nor extends it. Drift (SLO 5) is checked by hand with <code>D1SearchReconcile --full</code>, so it is not part of the streak.</small></p>
<p><small>${rag("green")} passes with margin · ${rag("amber")} passes within the margin, or has no verdict (too few samples) · ${rag("red")} breach. Amber margins: latency D1 p95 above ${SOAK_LATENCY_MAX_MS - SOAK_RAG_LATENCY_MARGIN_MS} ms or above ${Math.round(SOAK_RAG_LATENCY_RATIO * 100)}% of Azure's; unavailable above ${pct(SOAK_RAG_UNAVAILABLE_AMBER, 2)}; counts below ${pct(SOAK_RAG_COUNT_WITHIN_AMBER, 1)}; overlap below ${pct(SOAK_RAG_OVERLAP_AMBER, 0)}.</small></p>
<table>
<thead><tr>
<th>Day</th><th>Samples</th>
<th>1. Latency p95<br><small>D1 ≤ Azure and ≤ ${SOAK_LATENCY_MAX_MS} ms</small></th>
<th>2. D1 unavailable<br><small>≤ ${pct(SOAK_UNAVAILABLE_MAX, 1)}</small></th>
<th>3. Counts agree<br><small>≥ ${pct(SOAK_COUNT_WITHIN_MIN, 0)}</small></th>
<th>4. Browse overlap<br><small>≥ ${pct(SOAK_OVERLAP_MIN, 0)}</small></th>
<th>5. Drift<br><small>≤ ${pct(SOAK_DRIFT_MAX, 1)}</small></th>
<th>Verdict<br><small>SLOs 1–4</small></th>
</tr></thead>
<tbody>
${rows}
${row(report.week, `Last ${SOAK_DAYS} days`, "week")}
</tbody>
</table>
${renderSoakCharts(report)}`;
	return page(body, environment);
}

function messagePage(title: string, detail: string, environment?: string): string {
	return page(`<h2>${escapeHtml(title)}</h2><p>${detail}</p><p>Setup: <a href="${SOAK_DOC_URL}#dashboard-page">docs/search-shadow-soak.md § Dashboard page</a>.</p>`, environment);
}

/** GET /docs/search-shadow-soak. Auth is the `/docs/*` middleware (Auth0 docs session, `admin`). */
export async function searchShadowSoakPage(c: Context<{ Bindings: Env }>, fetcher?: typeof fetch, nowMs?: number): Promise<Response> {
	const environment = c.env.apiEnvironment;
	const source = soakSourceFromEnv(c.env, fetcher);
	const headers = { "cache-control": "no-store" };
	const missing = missingSoakConfig(source);
	if (missing.length > 0) {
		return c.html(
			messagePage("Not configured", `Missing Worker setting(s): <code>${missing.map(escapeHtml).join("</code>, <code>")}</code>.`, environment),
			503,
			headers
		);
	}
	try {
		const report = await loadSoakReport(source, nowMs);
		return c.html(renderSoakReport(report, environment), 200, headers);
	} catch (e) {
		const status = e instanceof SoakQueryError ? e.status : 0;
		console.error({ message: "search shadow soak page failed", status, error: e instanceof Error ? e.message : String(e) });
		const detail =
			status === 401 || status === 403
				? "The Analytics Engine SQL API refused the token (it needs <code>Account Analytics: Read</code> on this account)."
				: `Could not read Analytics Engine${status ? ` (status ${status})` : ""}.`;
		return c.html(messagePage("Soak data unavailable", detail, environment), 502, headers);
	}
}
