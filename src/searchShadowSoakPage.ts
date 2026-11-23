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
	SOAK_UNAVAILABLE_MAX,
	SoakQueryError,
	type SloResult,
	type SoakDay,
	type SoakReport,
	type SoakSource,
	type Verdict
} from "./searchShadowSoak";

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

function sloCell(result: SloResult, value: string): string {
	return `<td>${value}<br><small>n=${int(result.samples)}</small> ${badge(result.verdict)}</td>`;
}

type RowKind = "day" | "today" | "week";

function row(d: SoakDay, label: string, kind: RowKind): string {
	const lat = d.latency;
	return `<tr${kind === "day" ? "" : ` class="${kind}"`}>
<th scope="row">${escapeHtml(label)}</th>
<td>${int(d.counts.samples)}<br><small>browse ${int(d.counts.browseSamples)}</small></td>
<td>D1 ${ms(lat.d1P95)} / Azure ${ms(lat.azureP95)}<br><small>n=${int(lat.samples)}</small> ${badge(lat.verdict)}</td>
${sloCell(d.availability, pct(d.availability.value, 3))}
${sloCell(d.countAgreement, pct(d.countAgreement.value))}
${sloCell(d.browseOverlap, pct(d.browseOverlap.value))}
<td><a href="${DRIFT_DOC_URL}">manual</a></td>
<td>${kind === "today" ? badge("no-verdict", "in progress") : badge(d.verdict)}</td>
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
.streak { font-size: 18px; font-weight: 600; }
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

export function renderSoakReport(report: SoakReport, environment?: string): string {
	const [today, ...complete] = report.days;
	const rows = [row(today, `${today.day} (today, UTC)`, "today"), ...complete.map((d) => row(d, d.day, "day"))].join("\n");
	const body = `<p class="streak">Consecutive green days: ${report.streak} of ${SOAK_DAYS}</p>
<p><small>Generated ${escapeHtml(report.generatedAt)}. Days are UTC. A day passes only when SLOs 1–4 all pass; any fail breaks the streak; a day with fewer than ${SOAK_MIN_SAMPLES} samples (or fewer than ${SOAK_MIN_BROWSE_SAMPLES} browse samples for overlap) has no verdict and neither breaks nor extends it. Drift (SLO 5) is checked by hand with <code>D1SearchReconcile --full</code>, so it is not part of the streak.</small></p>
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
</table>`;
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
