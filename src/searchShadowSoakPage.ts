import type { Context } from "hono";
import type { Env } from "./Env";
import {
	latencyRag,
	latencyWithinSlo,
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
	SLO_RATIO_RULES,
	SoakQueryError,
	ragFor,
	utcDayStart,
	type RatioRule,
	type Rag,
	type SoakLatency,
	type SloResult,
	type SoakDay,
	type SoakReport,
	type SoakSource,
	type Verdict
} from "./searchShadowSoak";
import { renderChart, type ChartSeries } from "./soakCharts";
import { openApiDocumentVersion, resolveApiEnvironment, type ApiEnvironment } from "./apiEnvironment";
import { docsChromeStyles, docsEnvBanner, docsEnvironmentLabels, docsTitle, docsTopActions } from "./resources/docsChrome";

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

const DAY_MS = 86_400_000;

/** 0.05 → "5%", 0.99512 → "99.51%", 0 → "0%": two decimals at most, no trailing zeros. */
export function fmtPct(v: number | null): string {
	if (v === null) return "–";
	const x = v * 100;
	return `${Number(x.toFixed(x >= 10 ? 1 : 2))}%`;
}
const ms = (v: number | null) => (v === null ? "–" : `${Math.round(v)} ms`);
const int = (v: number) => Math.round(v).toLocaleString("en-GB");

/** `2026-11-24` → `Tue 24 Nov` (UTC). */
function dayName(day: string | number, weekday = true): string {
	const d = typeof day === "number" ? new Date(day) : new Date(`${day}T00:00:00Z`);
	return d.toLocaleDateString("en-GB", { ...(weekday ? { weekday: "short" } : {}), day: "numeric", month: "short", timeZone: "UTC" });
}

/** What a status icon shows. `wait` is "not enough data yet", never a warning. */
export type Show = "pass" | "margin" | "breach" | "wait";

const SHOW_LABEL: Record<Show, string> = {
	pass: "Pass",
	margin: "Close to limit",
	breach: "Over limit",
	wait: "Not enough data yet"
};

/** A judged SLO's icon: fail → breach, pass → pass or margin (its RAG), no verdict → wait (grey). */
export function showFor(verdict: Verdict, rag: Rag): Show {
	if (verdict === "fail") return "breach";
	if (verdict === "pass") return rag === "green" ? "pass" : "margin";
	return "wait";
}

/**
 * Today's provisional icons: the verdict rules from `searchShadowSoak.ts` applied to the values so
 * far, so a partial day shows how it is tracking. Display only; the streak never uses them.
 */
export function provisionalLatency(azureP95: number | null, d1P95: number | null): Show {
	if (azureP95 === null || d1P95 === null) return "wait";
	const verdict: Verdict = latencyWithinSlo(azureP95, d1P95) ? "pass" : "fail";
	return showFor(verdict, latencyRag(verdict, azureP95, d1P95));
}

export function provisionalRatio(value: number | null, rule: RatioRule): Show {
	if (value === null) return "wait";
	const verdict: Verdict = rule.pass(value) ? "pass" : "fail";
	return showFor(verdict, ragFor(verdict, rule.near(value)));
}

const ICON_SVG: Record<Show, string> = {
	pass: '<circle cx="12" cy="12" r="11" fill="#16a34a"/><path d="M6.8 12.6l3.4 3.4 7-7.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
	margin: '<path d="M12 1.8L23 21.6H1z" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 8.5v6.2" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="18" r="1.4" fill="#111827"/>',
	breach: '<circle cx="12" cy="12" r="11" fill="#dc2626"/><path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
	wait: '<circle cx="12" cy="12" r="11" fill="#9ca3af"/><path d="M8.5 6.5h7M8.5 17.5h7M9.6 6.5L12 12l-2.4 5.5M14.4 6.5L12 12l2.4 5.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
};

/** Inline SVG status icon; the tooltip (title / aria-label) carries the detail. */
export function icon(show: Show, detail?: string, size = 22): string {
	const label = escapeHtml(detail ? `${SHOW_LABEL[show]}: ${detail}` : SHOW_LABEL[show]);
	return `<span class="ic ic-${show}" role="img" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICON_SVG[show]}</svg></span>`;
}

/** What the live refresh sees from one refetch of the page. */
export type LiveResponse = {
	/** `Response.type`: `opaqueredirect` when the docs gate redirects to login (`redirect: "manual"`). */
	type: string;
	status: number;
	ok: boolean;
	/** The refetched page has the `#soak-live` swap target (the error pages do not). */
	hasTarget: boolean;
};

export type LiveAction = "expire" | "retry" | "swap";

/**
 * The live refresh's decision. Runs in the browser: it is embedded in the page with `toString()`,
 * so it must stay self-contained (no imports, no closures, no nested functions).
 */
export function liveRefreshAction(r: LiveResponse): LiveAction {
	if (r.type === "opaqueredirect" || r.status === 401 || r.status === 403) return "expire";
	if (!r.ok || !r.hasTarget) return "retry";
	return "swap";
}

/** The page's only script: refetch every 60 s while visible, swap `#soak-live`, stop on expiry. */
export function liveScript(): string {
	return `(() => {
	const decide = ${liveRefreshAction.toString()};
	const box = document.getElementById("soak-live");
	const status = document.getElementById("live-status");
	const toggle = document.getElementById("live-toggle");
	if (!box || !status || !toggle) return;
	let paused = false;
	let stopped = false;
	let busy = false;
	let timer = 0;
	const stamp = () => {
		const g = box.getAttribute("data-generated");
		return g ? new Date(g).toISOString().slice(11, 19) + " UTC" : "";
	};
	const show = () => {
		status.textContent = (paused ? "Paused" : "Live") + " · updated " + stamp();
		status.className = paused ? "live-dot paused" : "live-dot";
		toggle.textContent = paused ? "Resume" : "Pause";
	};
	const expire = () => {
		stopped = true;
		clearInterval(timer);
		status.className = "live-dot stopped";
		status.innerHTML = 'Session expired · <a href="">reload</a>';
		toggle.hidden = true;
	};
	async function tick() {
		if (paused || stopped || busy || document.hidden) return;
		busy = true;
		try {
			const r = await fetch(location.href, { credentials: "same-origin", redirect: "manual", cache: "no-store", headers: { accept: "text/html" } });
			const next = r.ok ? new DOMParser().parseFromString(await r.text(), "text/html").getElementById("soak-live") : null;
			const action = decide({ type: r.type, status: r.status, ok: r.ok, hasTarget: !!next });
			if (action === "expire") return expire();
			if (action === "retry" || !next) {
				status.textContent = "Update failed · retrying in a minute";
				return;
			}
			box.innerHTML = next.innerHTML;
			box.setAttribute("data-generated", next.getAttribute("data-generated") || "");
			show();
		} catch (e) {
			status.textContent = "Offline · retrying in a minute";
		} finally {
			busy = false;
		}
	}
	timer = setInterval(tick, 60000);
	toggle.addEventListener("click", () => {
		paused = !paused;
		show();
		if (!paused) tick();
	});
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) tick();
	});
	show();
})();`;
}

const STYLES = `
body { font: 17px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; color: #111827; background: #f8fafc; }
main { padding: 8px 24px 24px; max-width: 1200px; margin: 0 auto; }
h2 { font-size: 22px; margin: 32px 0 12px; }
h3 { font-size: 17px; margin: 0 0 8px; }
a { color: #1d4ed8; }
.muted { color: #6b7280; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; margin: 4px 0 20px; font-size: 16px; }
.live-dot::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #16a34a; margin-right: 6px; vertical-align: 1px; }
.live-dot.paused::before { background: #9ca3af; }
.live-dot.stopped::before { background: #dc2626; }
.meta button { font: 600 15px system-ui, sans-serif; padding: 4px 12px; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; }
.ic { display: inline-flex; vertical-align: middle; flex: none; }
.hero { background: #fff; border: 1px solid #e5e7eb; border-left: 8px solid #9ca3af; border-radius: 12px; padding: 20px 24px; }
.hero-pass { border-left-color: #16a34a; } .hero-margin { border-left-color: #f59e0b; } .hero-breach { border-left-color: #dc2626; }
.hero-head { display: flex; gap: 16px; align-items: center; }
.hero-status { font-size: 24px; font-weight: 700; margin: 0; }
.hero-sub { margin: 4px 0 0; color: #374151; }
.tracker { display: flex; gap: 8px; list-style: none; padding: 0; margin: 20px 0 0; }
.tracker li { flex: 1; text-align: center; padding: 10px 0; border-radius: 8px; background: #f3f4f6; color: #6b7280; font-weight: 700; font-size: 17px; border: 2px solid transparent; }
.tracker li.done { background: #16a34a; color: #fff; }
.tracker li.next { border-color: #9ca3af; border-style: dashed; color: #374151; }
.tracker li small { display: block; font-weight: 500; font-size: 13px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-weight: 600; color: #374151; }
.card-value { font-size: 30px; font-weight: 700; margin: 6px 0 2px; }
.card-sub { color: #4b5563; font-size: 15px; }
.bar { height: 8px; border-radius: 4px; background: #e5e7eb; margin-top: 8px; overflow: hidden; }
.bar span { display: block; height: 100%; background: #6b7280; }
.table-wrap { overflow-x: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
table { border-collapse: collapse; width: 100%; font-size: 16px; }
th, td { padding: 10px 14px; text-align: left; white-space: nowrap; border-bottom: 1px solid #eef0f3; }
thead th { background: #f9fafb; font-size: 15px; color: #374151; }
thead th small { display: block; font-weight: 500; color: #6b7280; }
td .ic { margin-right: 6px; }
td small { color: #6b7280; font-size: 14px; }
tr.week th, tr.week td { font-weight: 700; background: #f9fafb; border-bottom: 0; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 12px 0 0; padding: 0; list-style: none; color: #374151; font-size: 15px; }
.legend li { display: flex; align-items: center; gap: 6px; }
details.how { margin: 16px 0 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 16px; }
details.how summary { cursor: pointer; font-weight: 600; }
details.how li { margin: 6px 0; }
.chart-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 480px), 1fr)); gap: 16px; }
figure.chart { margin: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; }
figure.chart svg { width: 100%; height: auto; display: block; }
.chart-placeholder { flex: 1; min-height: 200px; display: flex; align-items: center; justify-content: center; color: #6b7280; background: #f9fafb; border: 1px dashed #d1d5db; border-radius: 8px; }
.chart-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; list-style: none; padding: 0; margin: 8px 0 0; font-size: 15px; color: #374151; }
.chart-legend li { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.chart-legend svg { width: 22px !important; flex: none; }
@media (max-width: 640px) {
	main { padding: 16px 14px 24px; }
	.docs-title { font-size: 28px !important; }
	.hero { padding: 16px; }
	.hero-status { font-size: 20px; }
	.tracker { gap: 4px; }
	.tracker li small { display: none; }
	.card-value { font-size: 26px; }
}`;

function page(body: string, environment: ApiEnvironment = "production", live = ""): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Search shadow soak${docsEnvironmentLabels(environment).titleSuffix}</title>
<style>
${docsChromeStyles(environment)}
${STYLES}
</style>
</head>
<body>
${docsEnvBanner(environment)}
${docsTopActions({ links: [{ href: "/docs", label: "API docs" }] })}
<main>
${docsTitle("D1 search shadow soak", openApiDocumentVersion)}
<p class="meta"><a href="${SOAK_DOC_URL}">Soak runbook</a>${live}</p>
${body}
</main>
${live ? `<script>${liveScript()}</script>` : ""}
</body>
</html>`;
}

/** Before this share of the UTC day has passed, today's sample rate is too noisy to project. */
const PROJECT_AFTER_DAY_FRACTION = 0.25;

export type SoakDates = {
	/** UTC midnight of each of the 7 steps, Day 1 first; `null` for a pass older than the report's days. */
	steps: (number | null)[];
	/** The last step: the earliest the soak can finish if every remaining day passes. */
	finishMs: number;
};

/**
 * The tracker's dates. Done steps are the days that actually passed (the same walk as `greenStreak`:
 * newest first, skipping today and no-verdict days, stopping at a fail), so a quiet day inside the
 * run is never labelled as a green step. Remaining steps start today while a run is going; with no
 * run, today is Day 1 only if it already has the minimum sample or, after the first quarter of the
 * day, is on course for it; otherwise tomorrow is.
 */
export function soakDates(report: SoakReport): SoakDates | null {
	const s = report.summary;
	if (s.status === "passed") return null;
	const nowMs = Date.parse(report.generatedAt);
	const todayMs = utcDayStart(nowMs);
	const passes: number[] = [];
	for (const d of report.days) {
		if (d.inProgress || d.verdict === "no-verdict") continue;
		if (d.verdict === "fail") break;
		passes.push(Date.parse(`${d.day}T00:00:00Z`));
	}
	const done = passes.slice(0, s.streak).reverse();
	let nextMs = todayMs;
	if (s.streak === 0) {
		const samples = report.days[0].counts.samples;
		const elapsed = (nowMs - todayMs) / DAY_MS;
		const onCourse = samples >= SOAK_MIN_SAMPLES || (elapsed >= PROJECT_AFTER_DAY_FRACTION && samples / elapsed >= SOAK_MIN_SAMPLES);
		if (!onCourse) nextMs += DAY_MS;
	}
	const remaining = SOAK_DAYS - s.streak;
	const steps: (number | null)[] = [
		...Array.from({ length: s.streak - done.length }, () => null),
		...done,
		...Array.from({ length: remaining }, (_, k) => nextMs + k * DAY_MS)
	];
	return { steps, finishMs: nextMs + (remaining - 1) * DAY_MS };
}

function heroTone(report: SoakReport): Show {
	const s = report.summary;
	if (s.status === "passed") return "pass";
	if (s.status === "breached" || s.rag === "red") return "breach";
	if (s.streak === 0) return "wait";
	return s.rag === "green" ? "pass" : "margin";
}

function heroSentence(report: SoakReport): string {
	const s = report.summary;
	const n = report.days[0].counts.samples;
	const today =
		n >= SOAK_MIN_SAMPLES ? `Today has enough samples (${int(n)}).` : `Today has ${int(n)} of ${SOAK_MIN_SAMPLES} samples needed.`;
	switch (s.status) {
		case "passed":
			return `Soak passed: ${s.streak} green days in a row.`;
		case "not-started":
			return "Waiting for the first samples.";
		case "breached":
			return `Failed on ${dayName(s.lastBreach!)}. The count restarts. ${today}`;
		default:
			return s.streak === 0 ? `Collecting data. ${today}` : `${s.streak} of ${SOAK_DAYS} green days. ${today}`;
	}
}

function hero(report: SoakReport): string {
	const s = report.summary;
	const tone = heroTone(report);
	const dates = soakDates(report);
	const day1 = dates?.steps[0];
	const sub = dates
		? `<p class="hero-sub">${day1 != null ? `Day 1: <strong>${dayName(day1)}</strong> · ` : ""}Earliest finish: <strong title="If every day from Day 1 passes. A day with too few samples does not count and pushes this back.">${dayName(dates.finishMs)}</strong></p>`
		: "";
	const steps = Array.from({ length: SOAK_DAYS }, (_, i) => {
		const n = i + 1;
		const state = n <= s.streak ? "done" : n === s.streak + 1 && s.status !== "not-started" ? "next" : "todo";
		const stepMs = dates?.steps[i];
		const date = stepMs != null ? `<small>${dayName(stepMs, false)}</small>` : "";
		const label = state === "done" ? `Day ${n}: green` : state === "next" ? `Day ${n}: next` : `Day ${n}: to come`;
		return `<li class="${state}" title="${label}" aria-label="${label}">${n}${date}</li>`;
	}).join("");
	return `<section class="hero hero-${tone}" aria-label="Soak status">
<div class="hero-head">${icon(tone, undefined, 44)}<div><p class="hero-status">${escapeHtml(heroSentence(report))}</p>${sub}</div></div>
<ol class="tracker" aria-label="${s.streak} of ${SOAK_DAYS} green days">${steps}</ol>
</section>`;
}

function card(title: string, show: Show, tip: string, value: string, sub: string, extra = ""): string {
	return `<div class="card"><div class="card-head"><span>${escapeHtml(title)}</span>${icon(show, tip)}</div><div class="card-value">${value}</div><div class="card-sub">${sub}</div>${extra}</div>`;
}

function todayCards(report: SoakReport): string {
	const t = report.days[0];
	const c = t.counts;
	const enough = c.samples >= SOAK_MIN_SAMPLES;
	const note = enough ? "so far today" : "provisional, too few samples to judge";
	const share = Math.min(1, c.samples / SOAK_MIN_SAMPLES);
	const lat = t.latency;
	const cards = [
		card(
			"Samples",
			enough ? "pass" : "wait",
			enough ? "enough to judge today" : `${int(c.samples)} of ${SOAK_MIN_SAMPLES}`,
			`${int(c.samples)} <small class="muted">/ ${SOAK_MIN_SAMPLES}</small>`,
			`browse ${int(c.browseSamples)} / ${SOAK_MIN_BROWSE_SAMPLES}`,
			`<div class="bar" aria-hidden="true"><span style="width:${Math.round(share * 100)}%"></span></div>`
		),
		card(
			"Speed (p95)",
			provisionalLatency(lat.azureP95, lat.d1P95),
			`D1 must be ≤ ${SOAK_LATENCY_MAX_MS} ms and no slower than Azure; ${note}`,
			ms(lat.d1P95),
			`Azure ${ms(lat.azureP95)} · target ≤ ${SOAK_LATENCY_MAX_MS} ms`
		),
		card(
			"D1 errors",
			provisionalRatio(t.availability.value, SLO_RATIO_RULES.availability),
			`share of searches D1 could not answer (timeouts ${int(c.timeouts)}); ${note}`,
			fmtPct(t.availability.value),
			`target ≤ ${fmtPct(SOAK_UNAVAILABLE_MAX)}`
		),
		card(
			"Counts match",
			provisionalRatio(t.countAgreement.value, SLO_RATIO_RULES.countAgreement),
			`D1 and Azure return about the same number of results; ${note}`,
			fmtPct(t.countAgreement.value),
			`target ≥ ${fmtPct(SOAK_COUNT_WITHIN_MIN)}`
		),
		card(
			"Browse overlap",
			provisionalRatio(t.browseOverlap.value, SLO_RATIO_RULES.browseOverlap),
			`9 of Azure's top 10 also in D1's; ${note}`,
			fmtPct(t.browseOverlap.value),
			`target ≥ ${fmtPct(SOAK_OVERLAP_MIN)}`
		)
	];
	return `<h2>Today so far <small class="muted">(UTC)</small></h2>
<div class="cards">${cards.join("")}</div>`;
}

function waitTip(d: SoakDay): string {
	return `too few samples to judge (${int(d.counts.samples)} of ${SOAK_MIN_SAMPLES})`;
}

function sloTd(d: SoakDay, r: SloResult, value: string, what: string): string {
	const show = showFor(r.verdict, r.rag);
	const tip = show === "wait" ? (r.value === null ? "no data" : waitTip(d)) : `${what}; ${int(r.samples)} samples`;
	return `<td>${icon(show, tip)}${value}</td>`;
}

const RESULT_WORD: Record<Show, string> = { pass: "Pass", margin: "Pass, close", breach: "Fail", wait: "Too few samples" };

function dayRow(d: SoakDay, label: string, week = false): string {
	const lat = d.latency;
	const latShow = showFor(lat.verdict, lat.rag);
	const latTip = latShow === "wait" ? waitTip(d) : `p50 D1 ${ms(lat.d1P50)} / Azure ${ms(lat.azureP50)}`;
	const result = showFor(d.verdict, d.rag);
	return `<tr${week ? ' class="week"' : ""}>
<th scope="row">${escapeHtml(label)}</th>
<td>${int(d.counts.samples)}</td>
<td>${icon(latShow, latTip)}${ms(lat.d1P95)} <small>vs ${ms(lat.azureP95)}</small></td>
${sloTd(d, d.availability, fmtPct(d.availability.value), `timeouts ${int(d.counts.timeouts)}`)}
${sloTd(d, d.countAgreement, fmtPct(d.countAgreement.value), "result counts within tolerance")}
${sloTd(d, d.browseOverlap, fmtPct(d.browseOverlap.value), `${int(d.counts.browseSamples)} browse samples`)}
<td>${icon(result, result === "wait" ? waitTip(d) : undefined)}${RESULT_WORD[result]}</td>
</tr>`;
}

function pastDays(report: SoakReport): string {
	const complete = report.days.slice(1);
	const withData = complete.filter((d) => d.counts.samples > 0);
	const hidden = complete.length - withData.length;
	if (withData.length === 0) {
		return `<h2>Past ${SOAK_DAYS} days</h2><p class="muted">No complete days with data yet.</p>`;
	}
	const rows = withData.map((d) => dayRow(d, dayName(d.day))).join("\n");
	return `<h2>Past ${SOAK_DAYS} days</h2>
<div class="table-wrap"><table>
<thead><tr><th>Day</th><th>Samples</th><th>Speed p95<small>D1 vs Azure</small></th><th>D1 errors</th><th>Counts match</th><th>Browse overlap</th><th>Result</th></tr></thead>
<tbody>
${rows}
${dayRow(report.week, `All ${SOAK_DAYS} days`, true)}
</tbody>
</table></div>
${hidden > 0 ? `<p class="muted">${hidden} day${hidden === 1 ? "" : "s"} with no data not shown.</p>` : ""}`;
}

const LEGEND = `<ul class="legend" aria-label="Key">
<li>${icon("pass")} Pass</li><li>${icon("margin")} Close to limit</li><li>${icon("breach")} Over limit</li><li>${icon("wait")} Not enough data yet</li>
</ul>`;

const HOW = `<details class="how"><summary>How this works</summary>
<ul>
<li>Each UTC day is judged on four checks. A day is <strong>green</strong> when all four pass. ${SOAK_DAYS} green days in a row completes the soak.</li>
<li>A day needs ${SOAK_MIN_SAMPLES} samples (and ${SOAK_MIN_BROWSE_SAMPLES} browse samples for overlap) to be judged. Quieter days don't count either way. A failed day restarts the count.</li>
<li><strong>Speed:</strong> D1's p95 must be ≤ ${SOAK_LATENCY_MAX_MS} ms and no slower than Azure's. Close to limit above ${SOAK_LATENCY_MAX_MS - SOAK_RAG_LATENCY_MARGIN_MS} ms or above ${Math.round(SOAK_RAG_LATENCY_RATIO * 100)}% of Azure's.</li>
<li><strong>D1 errors:</strong> D1 fails or times out on ≤ ${fmtPct(SOAK_UNAVAILABLE_MAX)} of searches. Close above ${fmtPct(SOAK_RAG_UNAVAILABLE_AMBER)}.</li>
<li><strong>Counts match:</strong> ≥ ${fmtPct(SOAK_COUNT_WITHIN_MIN)} of searches return about the same number of results. Close below ${fmtPct(SOAK_RAG_COUNT_WITHIN_AMBER)}.</li>
<li><strong>Browse overlap:</strong> ≥ ${fmtPct(SOAK_OVERLAP_MIN)} of browse searches have 9 of Azure's top 10 in D1's. Close below ${fmtPct(SOAK_RAG_OVERLAP_AMBER)}.</li>
<li><strong>Drift</strong> (≤ ${fmtPct(SOAK_DRIFT_MAX)}) is checked by hand with <code>D1SearchReconcile --full</code>, not here. <a href="${DRIFT_DOC_URL}">How to check drift</a>.</li>
<li>Today's icons are provisional and never count towards the streak. Hover an icon for detail.</li>
</ul>
</details>`;

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
	const labels = days.map((d) => dayName(d.day, false));
	const msFmt = (v: number) => `${Math.round(v)} ms`;
	const pctFmt = (v: number) => fmtPct(v);
	const latencyCeiling = { value: SOAK_LATENCY_MAX_MS, label: `${SOAK_LATENCY_MAX_MS} ms limit` };
	const charts = [
		renderChart({
			title: "Speed by day",
			labels,
			series: latencySeries(days.map((d) => d.latency)),
			thresholds: [latencyCeiling],
			format: msFmt
		}),
		renderChart({
			title: "Speed today by hour (UTC)",
			labels: report.hours.map((h) => `${h.hour}:00`),
			series: latencySeries(report.hours.map((h) => h.latency)),
			thresholds: [latencyCeiling],
			format: msFmt
		}),
		renderChart({
			title: "Samples per day",
			labels,
			series: [
				{ name: "All samples", color: "#6b7280", kind: "bar", values: days.map((d) => (d.counts.samples > 0 ? d.counts.samples : null)) },
				{ name: "Browse", color: "#0d9488", kind: "bar", values: days.map((d) => (d.counts.samples > 0 ? d.counts.browseSamples : null)) }
			],
			thresholds: [
				{ value: SOAK_MIN_SAMPLES, label: `${SOAK_MIN_SAMPLES} needed`, color: "#6b7280" },
				{ value: SOAK_MIN_BROWSE_SAMPLES, label: `${SOAK_MIN_BROWSE_SAMPLES} browse needed`, color: "#0d9488" }
			]
		}),
		renderChart({
			title: "D1 errors",
			labels,
			series: [
				{ name: "Errors", color: D1, values: days.map((d) => d.availability.value) },
				{ name: "Timeouts", color: "#7c3aed", dashed: true, values: days.map((d) => (d.counts.samples > 0 ? d.counts.timeouts / d.counts.samples : null)) }
			],
			thresholds: [
				{ value: SOAK_UNAVAILABLE_MAX, label: `${fmtPct(SOAK_UNAVAILABLE_MAX)} limit` },
				{ value: SOAK_RAG_UNAVAILABLE_AMBER, label: "close", color: "#d97706" }
			],
			format: pctFmt
		}),
		renderChart({
			title: "Counts match",
			labels,
			series: [{ name: "Counts match", color: D1, values: days.map((d) => d.countAgreement.value) }],
			thresholds: [
				{ value: SOAK_COUNT_WITHIN_MIN, label: `${fmtPct(SOAK_COUNT_WITHIN_MIN)} limit` },
				{ value: SOAK_RAG_COUNT_WITHIN_AMBER, label: "close", color: "#d97706" }
			],
			yMin: 0.9,
			yMax: 1,
			format: pctFmt
		}),
		renderChart({
			title: "Browse overlap",
			labels,
			series: [{ name: "Overlap ok", color: D1, values: days.map((d) => d.browseOverlap.value) }],
			thresholds: [
				{ value: SOAK_OVERLAP_MIN, label: `${fmtPct(SOAK_OVERLAP_MIN)} limit` },
				{ value: SOAK_RAG_OVERLAP_AMBER, label: "close", color: "#d97706" }
			],
			yMin: 0.8,
			yMax: 1,
			format: pctFmt
		}),
		renderChart({
			title: "Azure cache hit vs miss (p95)",
			labels,
			series: [
				{ name: "Azure hit", color: AZURE, values: days.map((d) => report.cache.get(d.day)?.HIT.azureP95 ?? null) },
				{ name: "Azure miss", color: AZURE, dashed: true, values: days.map((d) => report.cache.get(d.day)?.MISS.azureP95 ?? null) },
				{ name: "D1 (hit searches)", color: D1, values: days.map((d) => report.cache.get(d.day)?.HIT.d1P95 ?? null) },
				{ name: "D1 (miss searches)", color: D1, dashed: true, values: days.map((d) => report.cache.get(d.day)?.MISS.d1P95 ?? null) }
			],
			format: msFmt,
			emptyText: "No cache data yet"
		})
	];
	return `<section class="charts" aria-label="Charts"><h2>Trends</h2><div class="chart-grid">${charts.join("")}</div></section>`;
}

export function renderSoakReport(report: SoakReport, environment?: ApiEnvironment): string {
	const live = ` <span id="live-status" class="live-dot" aria-live="polite">Updated ${escapeHtml(report.generatedAt.slice(11, 19))} UTC</span> <button id="live-toggle" type="button">Pause</button>`;
	const body = `<div id="soak-live" data-generated="${escapeHtml(report.generatedAt)}">
${hero(report)}
${todayCards(report)}
${LEGEND}
${pastDays(report)}
${renderSoakCharts(report)}
</div>
${HOW}`;
	return page(body, environment, live);
}

function messagePage(title: string, detail: string, environment?: ApiEnvironment): string {
	return page(`<h2>${escapeHtml(title)}</h2><p>${detail}</p><p>Setup: <a href="${SOAK_DOC_URL}#dashboard-page">docs/search-shadow-soak.md § Dashboard page</a>.</p>`, environment);
}

/** GET /docs/search-shadow-soak. Auth is the `/docs/*` middleware (Auth0 docs session, `admin`). */
export async function searchShadowSoakPage(c: Context<{ Bindings: Env }>, fetcher?: typeof fetch, nowMs?: number): Promise<Response> {
	const environment = resolveApiEnvironment(c.env.apiEnvironment, new URL(c.req.url).hostname);
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
