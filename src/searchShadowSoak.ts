import type { SearchShadowLog } from "./searchShadow";

/**
 * Search shadow soak dashboard data (cultpodcasts/Api#304, soak RPP #1323, gate RPP #1316).
 *
 * The sampler writes one Workers Analytics Engine data point per `search shadow` sample
 * ({@link shadowDataPoint}); `/docs/search-shadow-soak` reads them back with the Analytics Engine
 * SQL API and judges each UTC day against the SLOs in `docs/search-shadow-soak.md`.
 *
 * Why Analytics Engine and not the Workers Observability query API: the Observability telemetry
 * query endpoint only accepts tokens with `Workers Observability: Write`, so it cannot be read with a
 * read-only token. The Analytics Engine SQL API needs only `Account Analytics: Read`.
 */

/** Index on every soak data point (one dataset per environment, so this is only a label). */
export const SOAK_INDEX = "search-shadow";

/** SLO targets, from docs/search-shadow-soak.md. */
export const SOAK_LATENCY_MAX_MS = 300;
export const SOAK_UNAVAILABLE_MAX = 0.001;
export const SOAK_COUNT_WITHIN_MIN = 0.99;
export const SOAK_OVERLAP_MIN = 0.95;
export const SOAK_DRIFT_MAX = 0.005;
/** A day with fewer samples than this has no verdict. */
export const SOAK_MIN_SAMPLES = 200;
/** Fewer browse overlap samples than this: the overlap SLO has no verdict. */
export const SOAK_MIN_BROWSE_SAMPLES = 50;
/** Consecutive passing days the soak needs. */
export const SOAK_DAYS = 7;
/** Days read for the streak (Analytics Engine keeps 3 months). */
export const SOAK_HISTORY_DAYS = 30;

const MS_PER_DAY = 86_400_000;

function flag(value: boolean | undefined): number {
	return value ? 1 : 0;
}

/**
 * Analytics Engine data point for one shadow sample. Doubles (1-based, as named in SQL):
 * 1 azure.latencyMs, 2 d1.latencyMs, 3 slo.d1Unavailable, 4 slo.bothOk, 5 countWithin present,
 * 6 slo.countWithin, 7 overlapOk present, 8 slo.overlapOk, 9 browse, 10 overlap.matched.
 * Blobs: 1 queryKind, 2 azure.cacheStatus, 3 d1.status, 4 d1.error (truncated). No query text.
 */
export function shadowDataPoint(log: SearchShadowLog): AnalyticsEngineDataPoint {
	return {
		indexes: [SOAK_INDEX],
		blobs: [
			log.queryKind,
			log.azure.cacheStatus ?? "",
			log.d1.status === undefined ? "" : String(log.d1.status),
			(log.d1.error ?? "").slice(0, 200)
		],
		doubles: [
			log.azure.latencyMs,
			log.d1.latencyMs,
			flag(log.slo.d1Unavailable),
			flag(log.slo.bothOk),
			flag(log.slo.countWithin !== undefined),
			flag(log.slo.countWithin),
			flag(log.slo.overlapOk !== undefined),
			flag(log.slo.overlapOk),
			flag(log.queryKind === "browse"),
			log.overlap.matched
		]
	};
}

/** Write a sample; never throws (it runs on waitUntil after the user's response). */
export function writeShadowDataPoint(dataset: AnalyticsEngineDataset | undefined, log: SearchShadowLog): void {
	if (!dataset || typeof dataset.writeDataPoint !== "function") return;
	try {
		dataset.writeDataPoint(shadowDataPoint(log));
	} catch (e) {
		console.error({ message: "search shadow analytics write failed", error: e instanceof Error ? e.message : String(e) });
	}
}

/** Dataset names are SQL identifiers: refuse anything else rather than interpolate it. */
export function isSafeDatasetName(name: string | undefined): name is string {
	return typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name);
}

function sqlTime(ms: number): string {
	return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

export type SoakWindow = { fromMs: number; toMs: number };

/** Start of the UTC day holding `nowMs`. */
export function utcDayStart(nowMs: number): number {
	return Math.floor(nowMs / MS_PER_DAY) * MS_PER_DAY;
}

export function soakQueries(dataset: string, nowMs: number): { daily: string; dailyLatency: string; weekLatency: string } {
	if (!isSafeDatasetName(dataset)) throw new Error("invalid dataset name");
	const today = utcDayStart(nowMs);
	const historyFrom = sqlTime(today - SOAK_HISTORY_DAYS * MS_PER_DAY);
	const weekFrom = sqlTime(today - SOAK_DAYS * MS_PER_DAY);
	const to = sqlTime(today + MS_PER_DAY);
	const until = sqlTime(today);
	const day = "toStartOfInterval(timestamp, INTERVAL '1' DAY)";
	const daily = `SELECT ${day} AS day,
 sum(_sample_interval) AS samples,
 sumIf(_sample_interval, double3 = 1) AS unavailable,
 sumIf(_sample_interval, double4 = 1) AS bothOk,
 sumIf(_sample_interval, double5 = 1) AS countSamples,
 sumIf(_sample_interval, double5 = 1 AND double6 = 1) AS countWithin,
 sumIf(_sample_interval, double9 = 1 AND double7 = 1) AS browseSamples,
 sumIf(_sample_interval, double9 = 1 AND double7 = 1 AND double8 = 1) AS browseOk
FROM ${dataset}
WHERE timestamp >= toDateTime('${historyFrom}') AND timestamp < toDateTime('${to}')
GROUP BY day
ORDER BY day
FORMAT JSON`;
	const latency = (from: string, until: string, grouped: boolean) => `SELECT ${grouped ? `${day} AS day,\n ` : ""}quantileExactWeighted(0.95)(double1, _sample_interval) AS azureP95,
 quantileExactWeighted(0.95)(double2, _sample_interval) AS d1P95,
 sum(_sample_interval) AS samples
FROM ${dataset}
WHERE double4 = 1 AND timestamp >= toDateTime('${from}') AND timestamp < toDateTime('${until}')${grouped ? "\nGROUP BY day\nORDER BY day" : ""}
FORMAT JSON`;
	return {
		daily,
		dailyLatency: latency(historyFrom, to, true),
		weekLatency: latency(weekFrom, until, false)
	};
}

export type SoakCounts = {
	samples: number;
	unavailable: number;
	bothOk: number;
	countSamples: number;
	countWithin: number;
	browseSamples: number;
	browseOk: number;
};

export type SoakLatency = { azureP95: number | null; d1P95: number | null; samples: number };

export type Verdict = "pass" | "fail" | "no-verdict";

export type SloResult = { value: number | null; samples: number; verdict: Verdict };

export type SoakDay = {
	/** UTC day, `YYYY-MM-DD`. */
	day: string;
	counts: SoakCounts;
	latency: SoakLatency & { verdict: Verdict };
	availability: SloResult;
	countAgreement: SloResult;
	browseOverlap: SloResult;
	/** Pass only when SLOs 1–4 all pass; any fail is fail; otherwise no verdict. Drift is judged by hand. */
	verdict: Verdict;
	/** Today: still being collected, not judged and not in the streak. */
	inProgress?: boolean;
};

const emptyCounts = (): SoakCounts => ({
	samples: 0,
	unavailable: 0,
	bothOk: 0,
	countSamples: 0,
	countWithin: 0,
	browseSamples: 0,
	browseOk: 0
});

function num(value: unknown): number {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : null;
}

/** `2026-11-20 00:00:00` (Analytics Engine) → `2026-11-20`. */
export function dayKey(value: unknown): string {
	return String(value ?? "").slice(0, 10);
}

export function parseCountsRow(row: Record<string, unknown>): SoakCounts {
	return {
		samples: num(row.samples),
		unavailable: num(row.unavailable),
		bothOk: num(row.bothOk),
		countSamples: num(row.countSamples),
		countWithin: num(row.countWithin),
		browseSamples: num(row.browseSamples),
		browseOk: num(row.browseOk)
	};
}

export function parseLatencyRow(row: Record<string, unknown> | undefined): SoakLatency {
	if (!row) return { azureP95: null, d1P95: null, samples: 0 };
	const samples = num(row.samples);
	return {
		azureP95: samples > 0 ? numOrNull(row.azureP95) : null,
		d1P95: samples > 0 ? numOrNull(row.d1P95) : null,
		samples
	};
}

function ratioSlo(part: number, whole: number, pass: (ratio: number) => boolean, enough: boolean): SloResult {
	if (whole <= 0) return { value: null, samples: whole, verdict: "no-verdict" };
	const value = part / whole;
	return { value, samples: whole, verdict: enough ? (pass(value) ? "pass" : "fail") : "no-verdict" };
}

/** Judge one day (or the 7-day total) against SLOs 1–4. */
export function evaluateSoak(day: string, counts: SoakCounts, latency: SoakLatency): SoakDay {
	const enough = counts.samples >= SOAK_MIN_SAMPLES;
	let latencyVerdict: Verdict = "no-verdict";
	if (enough && latency.azureP95 !== null && latency.d1P95 !== null && latency.samples > 0) {
		latencyVerdict = latency.d1P95 <= latency.azureP95 && latency.d1P95 <= SOAK_LATENCY_MAX_MS ? "pass" : "fail";
	}
	const availability = ratioSlo(counts.unavailable, counts.samples, (r) => r <= SOAK_UNAVAILABLE_MAX, enough);
	const countAgreement = ratioSlo(counts.countWithin, counts.countSamples, (r) => r >= SOAK_COUNT_WITHIN_MIN, enough);
	const browseOverlap = ratioSlo(
		counts.browseOk,
		counts.browseSamples,
		(r) => r >= SOAK_OVERLAP_MIN,
		enough && counts.browseSamples >= SOAK_MIN_BROWSE_SAMPLES
	);
	const verdicts = [latencyVerdict, availability.verdict, countAgreement.verdict, browseOverlap.verdict];
	const verdict: Verdict = verdicts.includes("fail") ? "fail" : verdicts.every((v) => v === "pass") ? "pass" : "no-verdict";
	return { day, counts, latency: { ...latency, verdict: latencyVerdict }, availability, countAgreement, browseOverlap, verdict };
}

/**
 * Consecutive passing complete days, counting back from yesterday. A no-verdict day neither breaks
 * nor extends the run (docs/search-shadow-soak.md, minimum sample); a fail ends it.
 */
export function greenStreak(daysNewestFirst: SoakDay[]): number {
	let streak = 0;
	for (const d of daysNewestFirst) {
		if (d.inProgress) continue;
		if (d.verdict === "fail") break;
		if (d.verdict === "pass") streak++;
	}
	return streak;
}

export type SoakReport = {
	generatedAt: string;
	/** Today (UTC, in progress) then the last 7 complete days, newest first. */
	days: SoakDay[];
	/** The last 7 complete days together. */
	week: SoakDay;
	streak: number;
};

function addCounts(a: SoakCounts, b: SoakCounts): SoakCounts {
	return {
		samples: a.samples + b.samples,
		unavailable: a.unavailable + b.unavailable,
		bothOk: a.bothOk + b.bothOk,
		countSamples: a.countSamples + b.countSamples,
		countWithin: a.countWithin + b.countWithin,
		browseSamples: a.browseSamples + b.browseSamples,
		browseOk: a.browseOk + b.browseOk
	};
}

/** Build the report from the three query results (rows as the SQL API returns them). */
export function buildSoakReport(
	nowMs: number,
	dailyRows: Record<string, unknown>[],
	dailyLatencyRows: Record<string, unknown>[],
	weekLatencyRow: Record<string, unknown> | undefined
): SoakReport {
	const counts = new Map(dailyRows.map((r) => [dayKey(r.day), parseCountsRow(r)]));
	const latency = new Map(dailyLatencyRows.map((r) => [dayKey(r.day), parseLatencyRow(r)]));
	const today = utcDayStart(nowMs);
	const history: SoakDay[] = [];
	for (let i = 0; i <= SOAK_HISTORY_DAYS; i++) {
		const key = new Date(today - i * MS_PER_DAY).toISOString().slice(0, 10);
		const day = evaluateSoak(key, counts.get(key) ?? emptyCounts(), latency.get(key) ?? parseLatencyRow(undefined));
		if (i === 0) {
			day.inProgress = true;
			day.verdict = "no-verdict";
		}
		history.push(day);
	}
	const weekDays = history.slice(1, SOAK_DAYS + 1);
	const weekCounts = weekDays.reduce((acc, d) => addCounts(acc, d.counts), emptyCounts());
	const week = evaluateSoak(`${weekDays[weekDays.length - 1].day} – ${weekDays[0].day}`, weekCounts, parseLatencyRow(weekLatencyRow));
	return {
		generatedAt: new Date(nowMs).toISOString(),
		days: history.slice(0, SOAK_DAYS + 1),
		week,
		streak: greenStreak(history)
	};
}

export type SoakSource = {
	accountId?: string;
	token?: string;
	dataset?: string;
	fetcher?: typeof fetch;
};

export class SoakQueryError extends Error {
	constructor(readonly status: number, message: string) {
		super(message);
		this.name = "SoakQueryError";
	}
}

/** Names (never values) of the settings the page still needs. */
export function missingSoakConfig(source: SoakSource): string[] {
	const missing: string[] = [];
	if (!source.accountId?.trim()) missing.push("cloudflareAccountId");
	if (!isSafeDatasetName(source.dataset)) missing.push("searchShadowAnalyticsDataset");
	if (!source.token?.trim()) missing.push("cfAnalyticsReadToken");
	return missing;
}

export const ANALYTICS_ENGINE_SQL_URL = (accountId: string) =>
	`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`;

async function runSql(source: Required<Pick<SoakSource, "accountId" | "token">> & SoakSource, sql: string): Promise<Record<string, unknown>[]> {
	const doFetch = source.fetcher ?? fetch;
	const response = await doFetch(ANALYTICS_ENGINE_SQL_URL(source.accountId.trim()), {
		method: "POST",
		headers: { authorization: `Bearer ${source.token.trim()}`, "content-type": "text/plain" },
		body: sql
	});
	const text = await response.text();
	if (!response.ok) {
		throw new SoakQueryError(response.status, `Analytics Engine SQL API answered ${response.status}`);
	}
	try {
		const parsed = JSON.parse(text) as { data?: Record<string, unknown>[] };
		return Array.isArray(parsed.data) ? parsed.data : [];
	} catch {
		throw new SoakQueryError(502, "Analytics Engine SQL API returned non-JSON");
	}
}

export async function loadSoakReport(source: SoakSource, nowMs: number = Date.now()): Promise<SoakReport> {
	const missing = missingSoakConfig(source);
	if (missing.length > 0) throw new SoakQueryError(503, `not configured: ${missing.join(", ")}`);
	const ready = source as Required<Pick<SoakSource, "accountId" | "token" | "dataset">> & SoakSource;
	const q = soakQueries(ready.dataset, nowMs);
	const [daily, dailyLatency, weekLatency] = await Promise.all([
		runSql(ready, q.daily),
		runSql(ready, q.dailyLatency),
		runSql(ready, q.weekLatency)
	]);
	return buildSoakReport(nowMs, daily, dailyLatency, weekLatency[0]);
}
