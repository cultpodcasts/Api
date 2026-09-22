import { afterEach, describe, expect, it, vi } from "vitest";
import { streamingScrapeSurvey } from "../src/streamingScrapeSurvey";
import { CDN_CGI_TRACE_URL } from "../src/cdnCgiTrace";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const usTrace = `fl=1\nh=cloudflare.com\ncolo=IAD\nloc=US\n`;
const gbTrace = `fl=1\nh=cloudflare.com\ncolo=LHR\nloc=GB\n`;

const { scrapeViaRegionalWorker } = vi.hoisted(() => ({
	scrapeViaRegionalWorker: vi.fn()
}));

vi.mock("../src/regionalScrape", () => ({
	scrapeViaRegionalWorker
}));

describe("streamingScrapeSurvey", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		scrapeViaRegionalWorker.mockReset();
	});

	it("returns 401 without submit/curate", async () => {
		const app = appWithPermissions(
			"/ops/streaming-scrape-survey",
			"post",
			streamingScrapeSurvey,
			[]
		);
		const resp = await app.request(
			"/ops/streaming-scrape-survey",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					targets: [
						{ id: "t1", service: "zdf", url: "https://www.zdf.de/video/x" }
					],
					legs: ["azure"],
					expectedPop: {}
				})
			},
			testEnv()
		);
		expect(resp.status).toBe(403);
	});

	it("aborts contaminated when cfFetch PoP misses expectedPop (no catalogue)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const u = String(input);
				if (u === CDN_CGI_TRACE_URL || u.includes("cdn-cgi/trace")) {
					return new Response(usTrace, { status: 200 });
				}
				throw new Error(`unexpected fetch ${u}`);
			})
		);

		const app = appWithPermissions(
			"/ops/streaming-scrape-survey",
			"post",
			streamingScrapeSurvey,
			["submit"]
		);
		const resp = await app.request(
			"/ops/streaming-scrape-survey",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					targets: [
						{
							id: "hulu-1",
							service: "hulu",
							url: "https://www.hulu.com/series/x"
						}
					],
					legs: ["cfFetch"],
					expectedPop: { cfFetch: { locs: ["GB"] } }
				})
			},
			testEnv()
		);
		expect(resp.status).toBe(409);
		const body = (await resp.json()) as {
			contaminated: boolean;
			rows: unknown[];
			error: string;
		};
		expect(body.contaminated).toBe(true);
		expect(body.rows).toEqual([]);
		expect(body.error).toMatch(/PoP preflight failed for cfFetch/);
	});

	it("runs azure-only without CF PoP when no CF legs", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const u = String(input);
				if (u.includes("/prepare")) {
					return new Response(
						JSON.stringify({
							podcastName: "Show",
							title: "Ep",
							description: "d"
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } }
					);
				}
				throw new Error(`unexpected fetch ${u}`);
			})
		);

		const app = appWithPermissions(
			"/ops/streaming-scrape-survey",
			"post",
			streamingScrapeSurvey,
			["curate"]
		);
		const resp = await app.request(
			"/ops/streaming-scrape-survey",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					targets: [
						{
							id: "zdf-1",
							service: "zdf",
							url: "https://www.zdf.de/video/x"
						}
					],
					legs: ["azure"],
					expectedPop: {}
				})
			},
			testEnv()
		);
		expect(resp.status).toBe(200);
		const body = (await resp.json()) as {
			contaminated: boolean;
			rows: Array<{ azure: boolean; recommend: string; prefer?: string }>;
		};
		expect(body.contaminated).toBe(false);
		expect(body.rows).toHaveLength(1);
		expect(body.rows[0].azure).toBe(true);
		expect(body.rows[0].recommend).toBe("azurePrepare");
		expect(body.rows[0].prefer ?? body.rows[0].recommend).toBe("azurePrepare");
	});

	it("preflights cfUsFetch via SCRAPE_US directHttp and surveys when PoP ok", async () => {
		scrapeViaRegionalWorker.mockImplementation(async (_binding: unknown, req: { url: string; mode: string }) => {
			expect(req.mode).toBe("directHttp");
			if (req.url.includes("cdn-cgi/trace")) {
				return {
					html: usTrace,
					finalUrl: req.url,
					title: "",
					htmlLength: usTrace.length,
					placement: { colo: "IAD", country: "US" }
				};
			}
			return {
				html:
					'<html><head><meta property="og:title" content="Hulu Show" /></head><body>' +
					"x".repeat(500) +
					"</body></html>",
				finalUrl: req.url,
				title: "Hulu Show",
				htmlLength: 600,
				placement: { colo: "IAD", country: "US" }
			};
		});

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const u = String(input);
				if (u === CDN_CGI_TRACE_URL || u.includes("cdn-cgi/trace")) {
					return new Response(gbTrace, { status: 200 });
				}
				throw new Error(`unexpected fetch ${u}`);
			})
		);

		const scrapeUs = { fetch: vi.fn() } as unknown as Fetcher;
		const app = appWithPermissions(
			"/ops/streaming-scrape-survey",
			"post",
			streamingScrapeSurvey,
			["submit"]
		);
		const resp = await app.request(
			"/ops/streaming-scrape-survey",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					targets: [
						{
							id: "hulu-1",
							service: "hulu",
							url: "https://www.hulu.com/series/x",
							assumedTechnique: "scrapeUsFetch"
						}
					],
					legs: ["cfUsFetch"],
					expectedPop: { cfUsFetch: { locs: ["US"] } }
				})
			},
			testEnv({ SCRAPE_US: scrapeUs })
		);
		expect(resp.status).toBe(200);
		const body = (await resp.json()) as {
			contaminated: boolean;
			rows: Array<{
				cfUsFetch: boolean;
				recommend: string;
				prefer?: string;
				geoFallback?: string | null;
			}>;
		};
		expect(body.contaminated).toBe(false);
		expect(body.rows[0].cfUsFetch).toBe(true);
		expect(body.rows[0].recommend).toBe("scrapeUsFetch");
		expect(body.rows[0].geoFallback).toBe("scrapeUsFetch");
		expect(scrapeViaRegionalWorker).toHaveBeenCalled();
	});

	it("rewrites Peacock asset URLs to watch-online before cfUsFetch", async () => {
		const asset =
			"https://www.peacocktv.com/watch/asset/tv/the-office-uk/8893980556248533112/seasons/1/episodes/work-experience-episode-2/9694b7a9-ffae-3b84-9606-5f852ccffee0";
		const seo =
			"https://www.peacocktv.com/watch-online/tv/the-office-uk/8893980556248533112/seasons/1/episodes/work-experience-episode-2/9694b7a9-ffae-3b84-9606-5f852ccffee0";

		scrapeViaRegionalWorker.mockImplementation(async (_binding: unknown, req: { url: string; mode: string }) => {
			expect(req.mode).toBe("directHttp");
			if (req.url.includes("cdn-cgi/trace")) {
				return {
					html: usTrace,
					finalUrl: req.url,
					title: "",
					htmlLength: usTrace.length,
					placement: { colo: "IAD", country: "US" }
				};
			}
			expect(req.url).toBe(seo);
			return {
				html:
					'<html><head><meta property="og:title" content="Watch The Office (UK) Season 1, Episode 2: Work Experience | Peacock" /></head><body>' +
					"x".repeat(500) +
					"</body></html>",
				finalUrl: seo,
				title: "Watch The Office (UK) Season 1, Episode 2: Work Experience | Peacock",
				htmlLength: 600,
				placement: { colo: "IAD", country: "US" }
			};
		});

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const u = String(input);
				if (u === CDN_CGI_TRACE_URL || u.includes("cdn-cgi/trace")) {
					return new Response(gbTrace, { status: 200 });
				}
				throw new Error(`unexpected fetch ${u}`);
			})
		);

		const scrapeUs = { fetch: vi.fn() } as unknown as Fetcher;
		const app = appWithPermissions(
			"/ops/streaming-scrape-survey",
			"post",
			streamingScrapeSurvey,
			["submit"]
		);
		const resp = await app.request(
			"/ops/streaming-scrape-survey",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					targets: [{ id: "peacock-1", service: "peacock", url: asset }],
					legs: ["cfUsFetch"],
					expectedPop: { cfUsFetch: { locs: ["US"] } }
				})
			},
			testEnv({ SCRAPE_US: scrapeUs })
		);
		expect(resp.status).toBe(200);
		const body = (await resp.json()) as {
			rows: Array<{ cfUsFetch: boolean; cfUsFetchDetail?: string }>;
		};
		expect(body.rows[0].cfUsFetch).toBe(true);
		expect(body.rows[0].cfUsFetchDetail).toContain("peacockRewrite=");
		expect(body.rows[0].cfUsFetchDetail).toContain("/watch-online/");
	});

	it("keeps scrapeUsFetch recommend when Azure and US both succeed for assumed geo", async () => {
		scrapeViaRegionalWorker.mockImplementation(async (_binding: unknown, req: { url: string; mode: string }) => {
			if (req.url.includes("cdn-cgi/trace")) {
				return {
					html: usTrace,
					finalUrl: req.url,
					title: "",
					htmlLength: usTrace.length,
					placement: { colo: "IAD", country: "US" }
				};
			}
			return {
				html:
					'<html><head><meta property="og:title" content="Hulu Show" /></head><body>' +
					"x".repeat(500) +
					"</body></html>",
				finalUrl: req.url,
				title: "Hulu Show",
				htmlLength: 600,
				placement: { colo: "IAD", country: "US" }
			};
		});

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const u = String(input);
				if (u.includes("/prepare")) {
					return new Response(
						JSON.stringify({ podcastName: "Azure Title", title: "Ep" }),
						{ status: 200, headers: { "Content-Type": "application/json" } }
					);
				}
				if (u === CDN_CGI_TRACE_URL || u.includes("cdn-cgi/trace")) {
					return new Response(usTrace, { status: 200 });
				}
				throw new Error(`unexpected fetch ${u}`);
			})
		);

		const app = appWithPermissions(
			"/ops/streaming-scrape-survey",
			"post",
			streamingScrapeSurvey,
			["submit"]
		);
		const resp = await app.request(
			"/ops/streaming-scrape-survey",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					targets: [
						{
							id: "hulu-1",
							service: "hulu",
							url: "https://www.hulu.com/series/x",
							assumedTechnique: "scrapeUsFetch"
						}
					],
					legs: ["azure", "cfUsFetch"],
					expectedPop: { cfUsFetch: { locs: ["US"] } }
				})
			},
			testEnv({ SCRAPE_US: { fetch: vi.fn() } as unknown as Fetcher })
		);
		expect(resp.status).toBe(200);
		const body = (await resp.json()) as {
			rows: Array<{
				azure: boolean;
				cfUsFetch: boolean;
				prefer: string;
				recommend: string;
				geoFallback: string | null;
			}>;
		};
		expect(body.rows[0].azure).toBe(true);
		expect(body.rows[0].cfUsFetch).toBe(true);
		expect(body.rows[0].prefer).toBe("azurePrepare");
		expect(body.rows[0].recommend).toBe("scrapeUsFetch");
		expect(body.rows[0].geoFallback).toBe("scrapeUsFetch");
	});
});
