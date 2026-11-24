import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));

import worker from "../src/index";
import type { Env } from "../src/Env";
import type { ActionContext } from "../src/ActionContext";
import { search } from "../src/search";
import { runSearchShadow, type SearchShadowLog } from "../src/searchShadow";
import {
	ANALYTICS_ENGINE_SQL_URL,
	buildSoakReport,
	evaluateSoak,
	greenStreak,
	latencyRag,
	loadSoakReport,
	SLO_RATIO_RULES,
	soakSummary,
	worstRag,
	shadowDataPoint,
	SOAK_DAYS,
	SoakQueryError,
	soakQueries,
	writeShadowDataPoint,
	type SoakCounts,
	type SoakDay
} from "../src/searchShadowSoak";
import {
	fmtPct,
	liveRefreshAction,
	provisionalLatency,
	provisionalRatio,
	renderSoakReport,
	SEARCH_SHADOW_SOAK_PATH,
	searchShadowSoakPage,
	showFor,
	soakDates
} from "../src/searchShadowSoakPage";
import { niceCeiling, renderChart } from "../src/soakCharts";
import { buildDocsPageHtml } from "../src/resources/docsPageHtml";
import { testEnv } from "./honoTestApp";
import { testEnv as auth0TestEnv } from "./support/honoRoute";

const NOW = Date.UTC(2026, 10, 23, 21, 0, 0); // 23 Nov 2026 21:00 UTC

function counts(partial: Partial<SoakCounts> = {}): SoakCounts {
	return { samples: 1000, unavailable: 0, bothOk: 1000, countSamples: 1000, countWithin: 1000, browseSamples: 100, browseOk: 100, ...partial };
}

const goodLatency = { azureP50: 90, azureP95: 250, d1P50: 40, d1P95: 120, samples: 1000 };

function shadowLog(partial: Partial<SearchShadowLog> = {}): SearchShadowLog {
	return {
		message: "search shadow",
		queryKind: "browse",
		query: "secret user text",
		azure: { status: 200, latencyMs: 80, count: 12, topIds: ["a"], cacheStatus: "HIT" },
		d1: { status: 200, latencyMs: 40, count: 12, topIds: ["a"] },
		overlap: { topN: 10, matched: 1, sameOrder: true },
		slo: { d1Ok: true, d1Unavailable: false, bothOk: true, countDelta: 0, countWithin: true, overlapNeeded: 1, overlapOk: true },
		...partial
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("shadowDataPoint", () => {
	it("records the per-sample SLO verdicts as doubles and never the query text", () => {
		const point = shadowDataPoint(shadowLog());
		expect(point.indexes).toEqual(["search-shadow"]);
		expect(point.doubles).toEqual([80, 40, 0, 1, 1, 1, 1, 1, 1, 1]);
		expect(point.blobs).toEqual(["browse", "HIT", "200", ""]);
		expect(JSON.stringify(point)).not.toContain("secret user text");
	});

	it("marks absent verdicts as not present and a timeout as unavailable", () => {
		const point = shadowDataPoint(
			shadowLog({
				queryKind: "text",
				d1: { latencyMs: 3000, count: null, topIds: [], error: "timeout" },
				slo: { d1Ok: false, d1Unavailable: true, bothOk: false }
			})
		);
		expect(point.doubles).toEqual([80, 3000, 1, 0, 0, 0, 0, 0, 0, 1]);
		expect(point.blobs).toEqual(["text", "HIT", "", "timeout"]);
	});

	it("never throws when the dataset write fails or there is no binding", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const broken = { writeDataPoint: () => { throw new Error("boom"); } } as unknown as AnalyticsEngineDataset;
		expect(() => writeShadowDataPoint(broken, shadowLog())).not.toThrow();
		expect(() => writeShadowDataPoint(undefined, shadowLog())).not.toThrow();
	});
});

describe("runSearchShadow → Analytics Engine", () => {
	it("writes one data point per sample alongside the log line", async () => {
		const writeDataPoint = vi.fn();
		const fetcher = {
			fetch: vi.fn(async () => new Response(JSON.stringify({ value: [{ id: "a" }], "@odata.count": 1 }), { status: 200 }))
		} as unknown as Fetcher;
		await runSearchShadow({
			fetcher,
			url: "https://search/indexes/episode/docs/search",
			requestBody: "{}",
			azure: { status: 200, latencyMs: 50, count: 1, topIds: ["a"] },
			topN: 10,
			query: "*",
			log: () => {},
			analytics: { writeDataPoint } as unknown as AnalyticsEngineDataset
		});
		expect(writeDataPoint).toHaveBeenCalledTimes(1);
		expect(writeDataPoint.mock.calls[0][0].doubles.slice(2, 9)).toEqual([0, 1, 1, 1, 1, 1, 1]);
	});

	it("POST /search sends the sample to the SearchShadowAnalytics binding", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ value: [{ id: "a" }], "@odata.count": 1 }), { status: 200 })));
		vi.spyOn(console, "info").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const writeDataPoint = vi.fn();
		const tasks: Promise<unknown>[] = [];
		const ctx = { waitUntil: (p: Promise<unknown>) => tasks.push(p), passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
		const env = testEnv({
			apihost: "https://search.example/indexes/test/docs/search?api-version=2024-07-01",
			apikey: "k",
			Data: { get: async () => null } as unknown as R2Bucket,
			searchShadowEnabled: "true",
			searchShadowSampleRate: "1",
			SEARCH: { fetch: vi.fn(async () => new Response(JSON.stringify({ value: [{ id: "a" }], "@odata.count": 1 }), { status: 200 })) } as unknown as Fetcher,
			SearchShadowAnalytics: { writeDataPoint } as unknown as AnalyticsEngineDataset
		} as Partial<Env>);
		const app = new Hono<{ Bindings: Env }>();
		app.post("/search", (c) => search(c as unknown as ActionContext));
		const resp = await app.request("/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ search: "x", count: true }) }, env, ctx);
		expect(resp.status).toBe(200);
		await Promise.all(tasks);
		expect(writeDataPoint).toHaveBeenCalledTimes(1);
	});
});

describe("soakQueries", () => {
	it("bounds every query to UTC days and the named dataset", () => {
		const q = soakQueries("search_shadow", NOW);
		expect(q.daily).toContain("FROM search_shadow");
		expect(q.daily).toContain("toDateTime('2026-10-24 00:00:00')");
		expect(q.daily).toContain("toDateTime('2026-11-24 00:00:00')");
		expect(q.weekLatency).toContain("toDateTime('2026-11-16 00:00:00')");
		expect(q.weekLatency).toContain("toDateTime('2026-11-23 00:00:00')");
		expect(q.dailyLatency).toContain("double4 = 1");
		expect(q.dailyLatency).toContain("quantileExactWeighted(0.5)(double2, _sample_interval) AS d1P50");
		expect(q.daily).toContain("blob4 = 'timeout'");
		expect(q.hourlyLatency).toContain("INTERVAL '1' HOUR");
		expect(q.hourlyLatency).toContain("toDateTime('2026-11-23 00:00:00')");
		expect(q.cacheLatency).toContain("GROUP BY bucket_day, cache_status");
		for (const sql of Object.values(q)) expect(sql).not.toMatch(/ AS (day|hour|cache)\b/);
	});

	it("refuses a dataset name that is not a plain identifier", () => {
		expect(() => soakQueries("x; DROP", NOW)).toThrow();
	});
});

describe("evaluateSoak", () => {
	it("passes a day that meets every SLO", () => {
		const d = evaluateSoak("2026-11-22", counts(), goodLatency);
		expect([d.latency.verdict, d.availability.verdict, d.countAgreement.verdict, d.browseOverlap.verdict, d.verdict]).toEqual([
			"pass",
			"pass",
			"pass",
			"pass",
			"pass"
		]);
	});

	it("fails latency only when D1 is slower than Azure", () => {
		expect(evaluateSoak("d", counts(), { azureP95: 100, d1P95: 120, samples: 1000 }).latency.verdict).toBe("fail");
		expect(evaluateSoak("d", counts(), { azureP95: 500, d1P95: 301, samples: 1000 }).latency.verdict).toBe("pass");
		expect(evaluateSoak("d", counts(), { azureP95: 500, d1P95: 301, samples: 1000 }).verdict).toBe("pass");
	});

	it("applies the availability, count and overlap thresholds", () => {
		expect(evaluateSoak("d", counts({ unavailable: 1 }), goodLatency).availability.verdict).toBe("pass");
		expect(evaluateSoak("d", counts({ unavailable: 2 }), goodLatency).availability.verdict).toBe("fail");
		expect(evaluateSoak("d", counts({ countWithin: 990 }), goodLatency).countAgreement.verdict).toBe("pass");
		expect(evaluateSoak("d", counts({ countWithin: 989 }), goodLatency).countAgreement.verdict).toBe("fail");
		expect(evaluateSoak("d", counts({ browseOk: 95 }), goodLatency).browseOverlap.verdict).toBe("pass");
		expect(evaluateSoak("d", counts({ browseOk: 94 }), goodLatency).browseOverlap.verdict).toBe("fail");
	});

	it("gives no verdict under the minimum sample, even when a ratio would fail", () => {
		const small = evaluateSoak("d", counts({ samples: 199, unavailable: 50 }), goodLatency);
		expect(small.availability.verdict).toBe("no-verdict");
		expect(small.verdict).toBe("no-verdict");
		const fewBrowse = evaluateSoak("d", counts({ browseSamples: 49, browseOk: 0 }), goodLatency);
		expect(fewBrowse.browseOverlap.verdict).toBe("no-verdict");
		expect(fewBrowse.availability.verdict).toBe("pass");
		expect(fewBrowse.verdict).toBe("no-verdict");
	});
});

describe("greenStreak", () => {
	const day = (verdict: SoakDay["verdict"], inProgress = false) => ({ ...evaluateSoak("d", counts(), goodLatency), verdict, inProgress });

	it("counts passing days back from yesterday, skips no-verdict days and stops at a fail", () => {
		expect(greenStreak([day("no-verdict", true), day("pass"), day("no-verdict"), day("pass"), day("fail"), day("pass")])).toBe(2);
		expect(greenStreak([day("pass", true), day("fail"), day("pass")])).toBe(0);
	});
});

describe("buildSoakReport", () => {
	it("shows today in progress plus 7 complete days and judges the week together", () => {
		const daily = [
			{ bucket_day: "2026-11-23 00:00:00", ...counts() },
			{ bucket_day: "2026-11-22 00:00:00", ...counts() },
			{ bucket_day: "2026-11-21 00:00:00", ...counts({ unavailable: "5" as unknown as number }) }
		];
		const latency = [
			{ bucket_day: "2026-11-22 00:00:00", ...goodLatency },
			{ bucket_day: "2026-11-21 00:00:00", ...goodLatency }
		];
		const report = buildSoakReport(NOW, { daily, dailyLatency: latency, weekLatency: { azureP95: "250", d1P95: "130", samples: "2000" } });
		expect(report.days).toHaveLength(SOAK_DAYS + 1);
		expect(report.days[0]).toMatchObject({ day: "2026-11-23", inProgress: true, verdict: "no-verdict" });
		expect(report.days[1].verdict).toBe("pass");
		expect(report.days[2].availability.verdict).toBe("fail");
		expect(report.days[3].verdict).toBe("no-verdict");
		expect(report.streak).toBe(1);
		expect(report.week.counts.samples).toBe(2000);
		expect(report.week.latency).toMatchObject({ d1P95: 130, verdict: "pass" });
		expect(report.week.verdict).toBe("fail");
		expect(report.week.day).toBe("2026-11-16 – 2026-11-22");
	});
});

describe("RAG", () => {
	it("is green with margin, amber inside the margin or without a verdict, red on a breach", () => {
		expect(evaluateSoak("d", counts(), goodLatency).rag).toBe("green");
		expect(evaluateSoak("d", counts({ unavailable: 1 }), goodLatency).availability.rag).toBe("amber"); // 0.1% > 0.05%
		expect(evaluateSoak("d", counts({ unavailable: 2 }), goodLatency).availability.rag).toBe("red");
		expect(evaluateSoak("d", counts({ countWithin: 995 }), goodLatency).countAgreement.rag).toBe("green");
		expect(evaluateSoak("d", counts({ countWithin: 994 }), goodLatency).countAgreement.rag).toBe("amber");
		expect(evaluateSoak("d", counts({ countWithin: 989 }), goodLatency).countAgreement.rag).toBe("red");
		expect(evaluateSoak("d", counts({ browseOk: 97 }), goodLatency).browseOverlap.rag).toBe("green");
		expect(evaluateSoak("d", counts({ browseOk: 96 }), goodLatency).browseOverlap.rag).toBe("amber");
		expect(evaluateSoak("d", counts({ samples: 100 }), goodLatency).rag).toBe("amber");
		expect(evaluateSoak("d", counts({ countWithin: 994 }), goodLatency).rag).toBe("amber");
	});

	it("puts latency amber when D1 p95 is above 90% of Azure's", () => {
		expect(latencyRag("pass", 250, 200)).toBe("green");
		expect(latencyRag("pass", 820, 570)).toBe("green"); // over 300 ms but well below Azure
		expect(latencyRag("pass", 290, 260)).toBe("green"); // 260/290 is under 90%; the old 250 ms margin no longer applies
		expect(latencyRag("pass", 200, 190)).toBe("amber"); // above 90% of Azure
		expect(latencyRag("fail", 200, 210)).toBe("red");
		expect(latencyRag("no-verdict", null, null)).toBe("amber");
	});

	it("takes the worst RAG", () => {
		expect(worstRag("green", "amber", "green")).toBe("amber");
		expect(worstRag("amber", "red")).toBe("red");
		expect(worstRag()).toBe("green");
	});
});

describe("soakSummary", () => {
	const day = (verdict: SoakDay["verdict"], inProgress = false, samples = 1000) => ({
		...evaluateSoak("2026-11-2x", counts({ samples }), goodLatency),
		verdict,
		inProgress
	});
	const week = evaluateSoak("w", counts(), goodLatency);

	it("reports day N of 7 while the streak builds", () => {
		const s = soakSummary([day("no-verdict", true), day("pass"), day("pass")], week, 2);
		expect(s).toMatchObject({ status: "in-progress", day: 2, rag: "green", headline: "Day 2 of 7" });
	});

	it("reports a breach on the latest judged day and goes red", () => {
		const failed = { ...day("fail"), day: "2026-11-22", rag: "red" as const };
		const s = soakSummary([day("no-verdict", true), failed, day("pass")], week, 0);
		expect(s).toMatchObject({ status: "breached", lastBreach: "2026-11-22", rag: "red", day: 0 });
	});

	it("judges the current run, not older failed days in the 7-day window", () => {
		const s = soakSummary([day("no-verdict", true), day("pass"), day("pass"), day("fail"), day("fail")], { ...week, rag: "red" }, 2);
		expect(s).toMatchObject({ status: "in-progress", day: 2, rag: "green" });
		const amberRun = soakSummary([day("no-verdict", true), { ...day("pass"), rag: "amber" as const }, day("pass")], week, 2);
		expect(amberRun.rag).toBe("amber");
	});

	it("reports not started without samples, and passed after 7 green days", () => {
		const empty = Array.from({ length: 8 }, (_, i) => day("no-verdict", i === 0, 0));
		expect(soakSummary(empty, evaluateSoak("w", counts({ samples: 0 }), goodLatency), 0).status).toBe("not-started");
		expect(soakSummary([day("no-verdict", true), ...Array.from({ length: 7 }, () => day("pass"))], week, 7)).toMatchObject({
			status: "passed",
			day: 7
		});
	});

	it("fills today's hours and the cache split from the query rows", () => {
		const report = buildSoakReport(NOW, {
			daily: [],
			dailyLatency: [],
			weekLatency: undefined,
			hourlyLatency: [{ bucket_hour: "2026-11-23 20:00:00", ...goodLatency }],
			cacheLatency: [
				{ bucket_day: "2026-11-22 00:00:00", cache_status: "HIT", ...goodLatency, azureP95: 20 },
				{ bucket_day: "2026-11-22 00:00:00", cache_status: "MISS", ...goodLatency, azureP95: 400 },
				{ bucket_day: "2026-11-22 00:00:00", cache_status: "DYNAMIC", ...goodLatency }
			]
		});
		expect(report.hours).toHaveLength(22); // 00h … 21h
		expect(report.hours[20].latency.d1P95).toBe(120);
		expect(report.hours[21].latency.d1P95).toBeNull();
		expect(report.cache.get("2026-11-22")).toMatchObject({ HIT: { azureP95: 20 }, MISS: { azureP95: 400 } });
		expect(report.summary.status).toBe("not-started");
	});
});

describe("renderChart", () => {
	it("draws lines with gaps for missing values, bars, thresholds and a legend", () => {
		const svg = renderChart({
			title: "Latency <test>",
			labels: ["a", "b", "c"],
			series: [
				{ name: "D1", color: "#f00", values: [10, null, 30] },
				{ name: "Samples", color: "#999", kind: "bar", values: [5, 6, null] }
			],
			thresholds: [{ value: 25, label: "limit" }]
		});
		expect(svg).toContain("<svg ");
		expect(svg).toContain("Latency &lt;test&gt;");
		expect(svg.match(/<path d="M[^"]*"/g)?.[0].match(/M/g)).toHaveLength(2); // gap → two segments
		expect(svg.match(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" fill="#999">/g)).toHaveLength(2);
		expect(svg).toContain("stroke-dasharray=\"4 3\"");
		expect(svg).toContain(">limit</text>");
	});

	it("renders an empty chart without NaN", () => {
		const svg = renderChart({ title: "empty", labels: [], series: [{ name: "x", color: "#000", values: [] }] });
		expect(svg).not.toContain("NaN");
	});

	it("shows a 'No data yet' placeholder instead of empty axes when no series has a value", () => {
		const html = renderChart({ title: "Cache", labels: ["a", "b"], series: [{ name: "x", color: "#000", values: [null, null] }], format: (v) => `${v} ms` });
		expect(html).toContain("No data yet");
		expect(html).not.toContain("<svg");
		expect(html).not.toContain(" ms");
		expect(renderChart({ title: "c", labels: ["a"], series: [{ name: "x", color: "#000", values: [null] }], emptyText: "No cache data yet" })).toContain("No cache data yet");
	});

	it("rounds the axis top to a readable step", () => {
		expect(niceCeiling(902)).toBe(1000);
		expect(niceCeiling(431)).toBe(500);
		expect(niceCeiling(220)).toBe(240);
		expect(niceCeiling(4)).toBe(4);
		expect(niceCeiling(0)).toBe(0);
	});
});

describe("soak page display helpers", () => {
	it("formats percentages without trailing zeros", () => {
		expect(fmtPct(0)).toBe("0%");
		expect(fmtPct(1)).toBe("100%");
		expect(fmtPct(0.99512)).toBe("99.5%");
		expect(fmtPct(0.001)).toBe("0.1%");
		expect(fmtPct(0.0005)).toBe("0.05%");
		expect(fmtPct(null)).toBe("–");
	});

	it("shows too few samples as grey 'wait', never as a warning", () => {
		expect(showFor("no-verdict", "amber")).toBe("wait");
		expect(showFor("pass", "green")).toBe("pass");
		expect(showFor("pass", "amber")).toBe("margin");
		expect(showFor("fail", "red")).toBe("breach");
	});

	it("judges today's provisional speed with the same thresholds", () => {
		expect(provisionalLatency(820, 570)).toBe("pass"); // over 300 ms but at or below Azure and under 90%
		expect(provisionalLatency(250, 260)).toBe("breach"); // slower than Azure
		expect(provisionalLatency(300, 271)).toBe("margin"); // above 90% of Azure
		expect(provisionalLatency(300, 120)).toBe("pass");
		expect(provisionalLatency(null, 120)).toBe("wait");
	});

	it("judges today's provisional ratios with the day verdict rules", () => {
		expect(provisionalRatio(0, SLO_RATIO_RULES.availability)).toBe("pass");
		expect(provisionalRatio(0.0007, SLO_RATIO_RULES.availability)).toBe("margin");
		expect(provisionalRatio(0.002, SLO_RATIO_RULES.availability)).toBe("breach");
		expect(provisionalRatio(0.993, SLO_RATIO_RULES.countAgreement)).toBe("margin");
		expect(provisionalRatio(0.94, SLO_RATIO_RULES.browseOverlap)).toBe("breach");
		expect(provisionalRatio(null, SLO_RATIO_RULES.browseOverlap)).toBe("wait");
	});

	const iso = (ms: number | null | undefined) => (ms == null ? null : new Date(ms).toISOString().slice(0, 10));

	it("dates Day 1 and the earliest finish", () => {
		const quiet = buildSoakReport(NOW, { daily: [{ bucket_day: "2026-11-23 00:00:00", ...counts({ samples: 4 }) }], dailyLatency: [], weekLatency: undefined });
		const d = soakDates(quiet)!;
		// 4 samples by 21:00 is not on course for 200: Day 1 is tomorrow.
		expect(d.steps.map(iso)).toEqual(["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30"]);
		expect(iso(d.finishMs)).toBe("2026-11-30");
		const busy = buildSoakReport(NOW, {
			daily: [
				{ bucket_day: "2026-11-23 00:00:00", ...counts({ samples: 300 }) },
				{ bucket_day: "2026-11-22 00:00:00", ...counts() }
			],
			dailyLatency: [{ bucket_day: "2026-11-22 00:00:00", ...goodLatency }],
			weekLatency: goodLatency
		});
		expect(busy.streak).toBe(1);
		const b = soakDates(busy)!;
		expect(iso(b.steps[0])).toBe("2026-11-22");
		expect(iso(b.steps[1])).toBe("2026-11-23");
		expect(iso(b.finishMs)).toBe("2026-11-28");
	});

	it("dates the green steps from the days that passed, skipping a quiet day inside the run", () => {
		// pass (20th) / too few samples (21st) / pass (22nd): streak 2, Day 1 is the 20th, not the 21st.
		const report = buildSoakReport(NOW, {
			daily: [
				{ bucket_day: "2026-11-20 00:00:00", ...counts() },
				{ bucket_day: "2026-11-21 00:00:00", ...counts({ samples: 50 }) },
				{ bucket_day: "2026-11-22 00:00:00", ...counts() }
			],
			dailyLatency: ["2026-11-20", "2026-11-21", "2026-11-22"].map((day) => ({ bucket_day: `${day} 00:00:00`, ...goodLatency })),
			weekLatency: goodLatency
		});
		expect(report.streak).toBe(2);
		const d = soakDates(report)!;
		expect(d.steps.map(iso)).toEqual(["2026-11-20", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]);
		expect(iso(d.finishMs)).toBe("2026-11-27");
		const html = renderSoakReport(report, "production");
		expect(html).toContain("Day 1: <strong>Fri 20 Nov</strong>");
		const tracker = html.match(/<ol class="tracker"[^>]*>(.*?)<\/ol>/s)![1];
		expect(tracker).toContain('<li class="done" title="Day 1: green" aria-label="Day 1: green">1<small>20 Nov</small></li>');
		expect(tracker).toContain('<li class="done" title="Day 2: green" aria-label="Day 2: green">2<small>22 Nov</small></li>');
		expect(tracker).not.toContain("21 Nov");
	});

	it("leaves a green step undated when its pass is older than the report's 7 days", () => {
		const report = buildSoakReport(NOW, { daily: [{ bucket_day: "2026-11-22 00:00:00", ...counts() }], dailyLatency: [{ bucket_day: "2026-11-22 00:00:00", ...goodLatency }], weekLatency: goodLatency });
		const d = soakDates({ ...report, streak: 2, summary: { ...report.summary, streak: 2, day: 2 } })!;
		expect(d.steps.map(iso).slice(0, 3)).toEqual([null, "2026-11-22", "2026-11-23"]);
	});

	it("does not project today's sample rate just after midnight", () => {
		const justAfter = Date.UTC(2026, 10, 23, 0, 1, 0);
		const one = buildSoakReport(justAfter, { daily: [{ bucket_day: "2026-11-23 00:00:00", ...counts({ samples: 1 }) }], dailyLatency: [], weekLatency: undefined });
		expect(iso(soakDates(one)!.steps[0])).toBe("2026-11-24");
		const morning = Date.UTC(2026, 10, 23, 7, 0, 0);
		const onCourse = buildSoakReport(morning, { daily: [{ bucket_day: "2026-11-23 00:00:00", ...counts({ samples: 80 }) }], dailyLatency: [], weekLatency: undefined });
		expect(iso(soakDates(onCourse)!.steps[0])).toBe("2026-11-23");
		const enough = buildSoakReport(justAfter, { daily: [{ bucket_day: "2026-11-23 00:00:00", ...counts({ samples: 200 }) }], dailyLatency: [], weekLatency: undefined });
		expect(iso(soakDates(enough)!.steps[0])).toBe("2026-11-23");
	});

	it("decides each live refresh: expire on login redirect or 401/403, retry on errors, swap otherwise", () => {
		expect(liveRefreshAction({ type: "opaqueredirect", status: 0, ok: false, hasTarget: false })).toBe("expire");
		expect(liveRefreshAction({ type: "basic", status: 401, ok: false, hasTarget: false })).toBe("expire");
		expect(liveRefreshAction({ type: "basic", status: 403, ok: false, hasTarget: false })).toBe("expire");
		expect(liveRefreshAction({ type: "basic", status: 502, ok: false, hasTarget: false })).toBe("retry");
		expect(liveRefreshAction({ type: "basic", status: 200, ok: true, hasTarget: false })).toBe("retry");
		expect(liveRefreshAction({ type: "basic", status: 200, ok: true, hasTarget: true })).toBe("swap");
	});

	describe("live refresh script", () => {
		type Fake = { textContent: string; innerHTML: string; className: string; hidden: boolean; attrs: Record<string, string> };
		function runScript(response: { type: string; status: number; ok: boolean; body?: string }, nextGenerated = "2026-11-23T21:01:00.000Z") {
			const report = buildSoakReport(NOW, { daily: [], dailyLatency: [], weekLatency: undefined });
			const html = renderSoakReport(report, "production");
			const scripts = [...html.matchAll(/<script>(.*?)<\/script>/gs)].map((m) => m[1]);
			expect(scripts).toHaveLength(1);
			const el = (attrs: Record<string, string> = {}): Fake & { getAttribute: (k: string) => string | null; setAttribute: (k: string, v: string) => void; addEventListener: (e: string, f: () => void) => void } => {
				const e = {
					textContent: "",
					innerHTML: "OLD",
					className: "",
					hidden: false,
					attrs,
					getAttribute: (k: string) => e.attrs[k] ?? null,
					setAttribute: (k: string, v: string) => {
						e.attrs[k] = v;
					},
					addEventListener: (_e: string, f: () => void) => {
						clicks.push(f);
					}
				};
				return e;
			};
			const clicks: (() => void)[] = [];
			const box = el({ "data-generated": report.generatedAt });
			const status = el();
			const toggle = el();
			const elements: Record<string, unknown> = { "soak-live": box, "live-status": status, "live-toggle": toggle };
			const document = { hidden: false, getElementById: (id: string) => elements[id] ?? null, addEventListener: () => {} };
			const fetchCalls: RequestInit[] = [];
			const fetch = async (_url: string, init: RequestInit) => {
				fetchCalls.push(init);
				return { ...response, text: async () => response.body ?? "" };
			};
			class DOMParser {
				parseFromString(text: string) {
					return { getElementById: () => (text.includes('id="soak-live"') ? { innerHTML: "NEW", getAttribute: () => nextGenerated } : null) };
				}
			}
			new Function("document", "location", "fetch", "setInterval", "clearInterval", "DOMParser", scripts[0])(
				document,
				{ href: "https://api.example/docs/search-shadow-soak" },
				fetch,
				() => 1,
				() => {},
				DOMParser
			);
			// Pause, then resume: resuming refreshes at once.
			clicks[0]();
			clicks[0]();
			return { box, status, toggle, fetchCalls, settle: () => new Promise((r) => setTimeout(r, 0)) };
		}

		it("swaps in the refetched content and shows the new time", async () => {
			const run = runScript({ type: "basic", status: 200, ok: true, body: '<div id="soak-live"></div>' });
			await run.settle();
			expect(run.fetchCalls[0]).toMatchObject({ redirect: "manual", credentials: "same-origin" });
			expect(run.box.innerHTML).toBe("NEW");
			expect(run.status.textContent).toBe("Live · updated 21:01:00 UTC");
		});

		it("stops with 'Session expired' when the docs session has gone", async () => {
			const run = runScript({ type: "opaqueredirect", status: 0, ok: false });
			await run.settle();
			expect(run.status.innerHTML).toContain("Session expired");
			expect(run.toggle.hidden).toBe(true);
			expect(run.box.innerHTML).toBe("OLD");
		});

		it("keeps the old content and retries when the page comes back without the swap target", async () => {
			const run = runScript({ type: "basic", status: 502, ok: false, body: "<h2>Soak data unavailable</h2>" });
			await run.settle();
			expect(run.status.textContent).toBe("Update failed · retrying in a minute");
			expect(run.box.innerHTML).toBe("OLD");
		});
	});

	it("leads with a plain status, today's cards and no rows for empty days", () => {
		const report = buildSoakReport(NOW, {
			daily: [{ bucket_day: "2026-11-23 00:00:00", ...counts({ samples: 4, browseSamples: 4, browseOk: 4, countSamples: 4, countWithin: 4, bothOk: 4 }) }],
			dailyLatency: [{ bucket_day: "2026-11-23 00:00:00", azureP50: 600, azureP95: 820, d1P50: 380, d1P95: 570, samples: 4 }],
			weekLatency: undefined,
			cacheLatency: []
		});
		const html = renderSoakReport(report, "production");
		expect(html).toContain("Collecting data. Today has 4 of 200 samples needed.");
		expect(html).toContain("Day 1: <strong>Tue 24 Nov</strong>");
		expect(html).toContain("Earliest finish:");
		expect(html.match(/<ol class="tracker"[^>]*>(.*?)<\/ol>/s)?.[1].match(/<li /g)).toHaveLength(SOAK_DAYS);
		expect(html).toContain('class="hero hero-wait"');
		expect(html).toContain("570 ms");
		expect(html).toContain("Speed (p95)");
		expect(html).toContain("target \u2264 Azure");
		expect(html).toContain("Speed by day");
		expect(html).not.toContain("300 ms limit");
		expect(html).not.toContain("\u2264 300 ms");
		expect(html).toContain("No complete days with data yet.");
		expect(html).toContain("No cache data yet");
		expect(html).toContain("How this works");
		// No dense legacy text: no AMBER badges, n=, provisional badges or rows of dashes.
		expect(html).not.toContain("AMBER");
		expect(html).not.toMatch(/\bn=\d/);
		expect(html).not.toContain("rag-amber");
		expect(html).not.toContain("<tbody>");
		// Live refresh hooks: the swap target, the indicator and its toggle, and one script.
		expect(html).toContain('id="soak-live"');
		expect(html).toContain('id="live-status"');
		expect(html).toContain('id="live-toggle"');
		expect(html.match(/<script>/g)).toHaveLength(1);
	});
});

describe("loadSoakReport", () => {
	const source = { accountId: "acct", token: "tok-value", dataset: "search_shadow" };

	it("runs five SQL API queries with the bearer token", async () => {
		const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ data: [] }), { status: 200 }));
		const report = await loadSoakReport({ ...source, fetcher: fetcher as unknown as typeof fetch }, NOW);
		expect(fetcher).toHaveBeenCalledTimes(5);
		const [url, init] = fetcher.mock.calls[0];
		expect(url).toBe(ANALYTICS_ENGINE_SQL_URL("acct"));
		expect(init.method).toBe("POST");
		expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok-value");
		expect(report.streak).toBe(0);
	});

	it("raises the SQL API status, without the token, when it refuses", async () => {
		const fetcher = vi.fn(async () => new Response("denied", { status: 403 }));
		const err = await loadSoakReport({ ...source, fetcher: fetcher as unknown as typeof fetch }, NOW).catch((e) => e);
		expect(err).toBeInstanceOf(SoakQueryError);
		expect(err.status).toBe(403);
		expect(String(err.message)).not.toContain("tok-value");
	});
});

describe("GET /docs/search-shadow-soak", () => {
	function pageApp(env: Partial<Env>, fetcher?: typeof fetch) {
		const app = new Hono<{ Bindings: Env }>();
		app.get(SEARCH_SHADOW_SOAK_PATH, (c) => searchShadowSoakPage(c, fetcher, NOW));
		return (path = SEARCH_SHADOW_SOAK_PATH) => app.request(path, {}, testEnv(env));
	}

	it("redirects to the Auth0 docs login without a docs session", async () => {
		const resp = await worker.fetch(new Request(`https://api.example${SEARCH_SHADOW_SOAK_PATH}`), auth0TestEnv(), {} as ExecutionContext);
		expect(resp.status).toBe(302);
		expect(resp.headers.get("location")).toBe("/docs/login");
	});

	it("names (never shows) the missing settings when not configured", async () => {
		const resp = await pageApp({ cloudflareAccountId: "acct", searchShadowAnalyticsDataset: "search_shadow" })();
		expect(resp.status).toBe(503);
		const html = await resp.text();
		expect(html).toContain("cfAnalyticsReadToken");
		expect(html).not.toContain("cloudflareAccountId");
	});

	it("renders the per-day SLO table and the streak", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
			const sql = String(init.body);
			const data = sql.includes("quantileExactWeighted")
				? sql.includes("GROUP BY")
					? [{ bucket_day: "2026-11-22 00:00:00", ...goodLatency }]
					: [goodLatency]
				: [{ bucket_day: "2026-11-22 00:00:00", ...counts() }];
			return new Response(JSON.stringify({ data }), { status: 200 });
		});
		const resp = await pageApp(
			{ cloudflareAccountId: "acct", searchShadowAnalyticsDataset: "search_shadow", cfAnalyticsReadToken: "tok-value" },
			fetcher as unknown as typeof fetch
		)();
		expect(resp.status).toBe(200);
		expect(resp.headers.get("cache-control")).toBe("no-store");
		const html = await resp.text();
		expect(html).toContain("1 of 7 green days.");
		expect(html).toContain('class="hero hero-pass"');
		expect(html.match(/<svg /g)?.length).toBeGreaterThanOrEqual(6);
		expect(html).toContain("Azure cache hit vs miss");
		expect(html).toContain("Speed today by hour (UTC)");
		expect(html).toContain("Sun 22 Nov");
		expect(html).toContain("All 7 days");
		expect(html).toContain("How to check drift");
		expect(html).toContain("<th>Result</th>");
		expect(html.match(/<th>Day<\/th>/g)).toHaveLength(1);
		expect(html).toContain('<tr class="week">');
		expect(html).toContain("6 days with no data not shown.");
		expect(html).toContain('aria-label="Pass"');
		expect(html).not.toContain("tok-value");
	});

	it("is linked from the /docs page header", () => {
		const html = buildDocsPageHtml({ apiEnvironment: "production" });
		expect(html).toContain(`href="${SEARCH_SHADOW_SOAK_PATH}"`);
	});

	it("explains a refused token as a 502 page", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const fetcher = vi.fn(async () => new Response("no", { status: 403 }));
		const resp = await pageApp(
			{ cloudflareAccountId: "acct", searchShadowAnalyticsDataset: "search_shadow", cfAnalyticsReadToken: "tok-value" },
			fetcher as unknown as typeof fetch
		)();
		expect(resp.status).toBe(502);
		expect(await resp.text()).toContain("Account Analytics: Read");
	});
});
