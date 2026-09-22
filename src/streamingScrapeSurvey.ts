import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import {
	CDN_CGI_TRACE_URL,
	type ExpectedPop,
	parseCdnCgiTrace,
	traceMatchesExpectedPop,
	type CdnCgiTrace
} from "./cdnCgiTrace";
import { fetchHtmlWithBrowserRendering } from "./browserRenderingHtml";
import { fetchCatalogHtml } from "./catalogHtmlPrepare";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { isMarketingShellHtml } from "./marketingShellReject";
import { LogCollector } from "./LogCollector";
import { scrapeViaRegionalWorker } from "./regionalScrape";
import {
	canCallAzureSubmitBackend,
	azureSubmitBackendDenialStatus
} from "./submitAccess";

export const SURVEY_LEGS = ["azure", "cfFetch", "cfBr", "cfUsFetch"] as const;
export type SurveyLeg = (typeof SURVEY_LEGS)[number];

export type SurveyTarget = {
	id: string;
	service: string;
	url: string;
	assumedTechnique?: string;
};

export type StreamingScrapeSurveyRequest = {
	targets: SurveyTarget[];
	legs?: SurveyLeg[];
	/** Required for each enabled CF leg (cfFetch, cfBr, cfUsFetch). */
	expectedPop: Partial<Record<"cfFetch" | "cfBr" | "cfUsFetch", ExpectedPop>>;
};

type LegResult = {
	ok: boolean | null;
	skip?: boolean;
	detail: string;
	title?: string | null;
	finalUrl?: string | null;
	trace?: CdnCgiTrace | null;
};

function titleFromHtml(html: string): string {
	const og = html.match(
		/(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i
	);
	if (og?.[1]) {
		return og[1];
	}
	const doc = html.match(/<title>([^<]*)<\/title>/i);
	return doc?.[1]?.trim() ?? "";
}

function recommend(row: {
	azure: boolean | null;
	cfFetch: boolean | null;
	cfBr: boolean | null;
	cfUsFetch: boolean | null;
	azureSkip?: boolean;
}): string {
	if (row.azure === true) {
		return "azurePrepare";
	}
	if (row.cfUsFetch === true) {
		return "scrapeUsFetch";
	}
	if (row.cfFetch === true) {
		return "cfDirectHttp";
	}
	if (row.cfBr === true) {
		return "browserRendering";
	}
	if (row.azureSkip) {
		return "unknown-run-with-azure";
	}
	return "blocked";
}

async function workerFetchTrace(): Promise<CdnCgiTrace> {
	const resp = await fetch(CDN_CGI_TRACE_URL, {
		redirect: "follow",
		signal: AbortSignal.timeout(10_000)
	});
	const raw = await resp.text();
	return parseCdnCgiTrace(raw);
}

async function edgeBrTrace(c: Auth0ActionContext): Promise<CdnCgiTrace> {
	if (!c.env.BROWSER) {
		throw new Error("BROWSER binding not configured");
	}
	const br = await fetchHtmlWithBrowserRendering(c.env.BROWSER, CDN_CGI_TRACE_URL);
	const text = br.html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<[^>]+>/g, "\n")
		.replace(/&nbsp;/g, " ");
	return parseCdnCgiTrace(text);
}

async function usFetchTrace(c: Auth0ActionContext): Promise<CdnCgiTrace> {
	if (!c.env.SCRAPE_US) {
		throw new Error("SCRAPE_US binding not configured");
	}
	const scraped = await scrapeViaRegionalWorker(c.env.SCRAPE_US, {
		url: CDN_CGI_TRACE_URL,
		mode: "directHttp",
		service: "survey-preflight"
	});
	return parseCdnCgiTrace(scraped.html);
}

type PreflightLeg = "cfFetch" | "cfBr" | "cfUsFetch";

async function runPopPreflight(
	c: Auth0ActionContext,
	legs: SurveyLeg[],
	expectedPop: StreamingScrapeSurveyRequest["expectedPop"]
): Promise<
	| { ok: true; traces: Partial<Record<PreflightLeg, CdnCgiTrace>> }
	| {
			ok: false;
			contaminated: true;
			error: string;
			observed: Partial<Record<PreflightLeg, CdnCgiTrace | { error: string }>>;
			expected: StreamingScrapeSurveyRequest["expectedPop"];
	  }
> {
	const cfLegs = legs.filter((l): l is PreflightLeg =>
		l === "cfFetch" || l === "cfBr" || l === "cfUsFetch"
	);
	const traces: Partial<Record<PreflightLeg, CdnCgiTrace>> = {};
	const observed: Partial<Record<PreflightLeg, CdnCgiTrace | { error: string }>> = {};

	for (const leg of cfLegs) {
		const expected = expectedPop?.[leg];
		if (!expected || (!(expected.locs?.length) && !(expected.colos?.length))) {
			return {
				ok: false,
				contaminated: true,
				error: `expectedPop.${leg} required (locs and/or colos)`,
				observed,
				expected: expectedPop
			};
		}
		try {
			const trace =
				leg === "cfFetch"
					? await workerFetchTrace()
					: leg === "cfBr"
						? await edgeBrTrace(c)
						: await usFetchTrace(c);
			traces[leg] = trace;
			observed[leg] = trace;
			if (!traceMatchesExpectedPop(trace, expected)) {
				return {
					ok: false,
					contaminated: true,
					error: `PoP preflight failed for ${leg}: observed loc=${trace.loc} colo=${trace.colo}`,
					observed,
					expected: expectedPop
				};
			}
		} catch (e) {
			const detail = e instanceof Error ? e.message : String(e);
			observed[leg] = { error: detail };
			return {
				ok: false,
				contaminated: true,
				error: `PoP preflight error for ${leg}: ${detail}`,
				observed,
				expected: expectedPop
			};
		}
	}

	return { ok: true, traces };
}

function submitPrepareUrl(env: Auth0ActionContext["env"]): URL {
	const base = new URL(env.secureSubmitEndpoint.toString());
	if (!base.pathname.endsWith("/")) {
		base.pathname = `${base.pathname}/`;
	}
	base.pathname = `${base.pathname}prepare`;
	return base;
}

async function azurePrepareLeg(
	c: Auth0ActionContext,
	pageUrl: string
): Promise<LegResult> {
	try {
		const endpoint = submitPrepareUrl(c.env);
		const resp = await fetch(endpoint, {
			method: "POST",
			headers: buildFetchHeaders(c.req, endpoint),
			body: JSON.stringify({ url: pageUrl })
		});
		const text = await resp.text();
		if (resp.status !== 200) {
			return {
				ok: false,
				detail: `azure prepare ${resp.status} ${text.slice(0, 180)}`
			};
		}
		let title: string | null = null;
		try {
			const j = JSON.parse(text) as { podcastName?: string; title?: string };
			title = j.podcastName ?? j.title ?? null;
		} catch {
			/* ignore */
		}
		const ok = Boolean(title);
		return {
			ok,
			title,
			detail: ok
				? `azure prepare 200 title=${title}`
				: `azure prepare 200 but no title/podcastName`
		};
	} catch (e) {
		return { ok: false, detail: e instanceof Error ? e.message : String(e) };
	}
}

async function cfFetchLeg(
	pageUrl: string,
	service: string
): Promise<LegResult> {
	const messages: string[] = [];
	const html = await fetchCatalogHtml(new URL(pageUrl), (m) => messages.push(m));
	if (!html) {
		return { ok: false, detail: messages.join("; ") || "catalog fetch miss" };
	}
	const title = titleFromHtml(html);
	const shell = isMarketingShellHtml({
		service,
		submittedUrl: pageUrl,
		finalUrl: pageUrl,
		title,
		html
	});
	const ok =
		!shell &&
		html.length >= 500 &&
		(Boolean(title) ||
			/property=["']og:title["']/i.test(html) ||
			html.includes("__NEXT_DATA__"));
	return {
		ok,
		title,
		finalUrl: pageUrl,
		detail: `usable=${ok} marketingShell=${shell} title=${title}`
	};
}

async function cfBrLeg(c: Auth0ActionContext, pageUrl: string, service: string): Promise<LegResult> {
	if (!c.env.BROWSER) {
		return { ok: false, detail: "BROWSER not configured" };
	}
	try {
		const br = await fetchHtmlWithBrowserRendering(c.env.BROWSER, pageUrl);
		const d = br.diagnostics;
		const shell = isMarketingShellHtml({
			service,
			submittedUrl: pageUrl,
			finalUrl: d.finalUrl,
			title: d.title,
			html: br.html
		});
		const ok =
			!shell &&
			br.html.length >= 500 &&
			(/property=["']og:title["']/i.test(br.html) || br.html.includes("__NEXT_DATA__"));
		return {
			ok,
			title: d.title,
			finalUrl: d.finalUrl,
			detail: `usable=${ok} marketingShell=${shell} title=${d.title} final=${d.finalUrl}`
		};
	} catch (e) {
		return { ok: false, detail: e instanceof Error ? e.message : String(e) };
	}
}

async function cfUsFetchLeg(
	c: Auth0ActionContext,
	pageUrl: string,
	service: string
): Promise<LegResult> {
	if (!c.env.SCRAPE_US) {
		return { ok: false, detail: "SCRAPE_US not configured" };
	}
	try {
		const scraped = await scrapeViaRegionalWorker(c.env.SCRAPE_US, {
			url: pageUrl,
			mode: "directHttp",
			service
		});
		const title = scraped.title || titleFromHtml(scraped.html);
		const shell = isMarketingShellHtml({
			service,
			submittedUrl: pageUrl,
			finalUrl: scraped.finalUrl,
			title,
			html: scraped.html
		});
		const ok =
			!shell &&
			scraped.html.length >= 500 &&
			(Boolean(title) ||
				/property=["']og:title["']/i.test(scraped.html) ||
				scraped.html.includes("__NEXT_DATA__"));
		return {
			ok,
			title,
			finalUrl: scraped.finalUrl,
			detail: `usable=${ok} marketingShell=${shell} title=${title} final=${scraped.finalUrl} colo=${scraped.placement?.colo ?? "none"}`
		};
	} catch (e) {
		return { ok: false, detail: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Ops survey: PoP-preflight then independent azure / CF fetch / edge BR / US fetch legs.
 * Geo soft-walls use SCRAPE_US + directHttp only (never BR).
 */
export async function streamingScrapeSurvey(c: Auth0ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "ops.streaming_scrape_survey" });
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });

	const auth0Payload = c.var.auth0("payload");
	if (!canCallAzureSubmitBackend(auth0Payload)) {
		const status = azureSubmitBackendDenialStatus(auth0Payload);
		logCollector.emitError({
			event: "ops.streaming_scrape_survey.authz",
			outcome: status === 401 ? "unauthorised" : "forbidden",
			status
		});
		return c.json({ error: status === 401 ? "Unauthorised" : "Forbidden" }, status);
	}

	let body: StreamingScrapeSurveyRequest;
	try {
		body = (await c.req.json()) as StreamingScrapeSurveyRequest;
	} catch {
		return c.json({ error: "Invalid JSON" }, 400);
	}

	const targets = Array.isArray(body.targets) ? body.targets : [];
	if (targets.length === 0) {
		return c.json({ error: "targets required" }, 400);
	}
	for (const t of targets) {
		if (!t?.url?.trim() || !t?.service?.trim() || !t?.id?.trim()) {
			return c.json({ error: "each target needs id, service, url" }, 400);
		}
		try {
			const u = new URL(t.url.trim());
			if (u.protocol !== "http:" && u.protocol !== "https:") {
				return c.json({ error: `invalid url ${t.id}` }, 400);
			}
		} catch {
			return c.json({ error: `invalid url ${t.id}` }, 400);
		}
	}

	const legs: SurveyLeg[] = (
		body.legs?.length ? body.legs : (["azure", "cfFetch", "cfBr", "cfUsFetch"] as SurveyLeg[])
	).filter((l): l is SurveyLeg => (SURVEY_LEGS as readonly string[]).includes(l));

	if (legs.includes("cfUsFetch") && !c.env.SCRAPE_US) {
		return c.json({ error: "SCRAPE_US binding is not configured" }, 500);
	}
	if (legs.includes("cfBr") && !c.env.BROWSER) {
		return c.json({ error: "BROWSER binding is not configured" }, 500);
	}

	const preflight = await runPopPreflight(c, legs, body.expectedPop ?? {});
	if (!preflight.ok) {
		logCollector.emitWarn({
			event: "ops.streaming_scrape_survey.contaminated",
			outcome: "error",
			status: 409
		});
		return c.json(
			{
				ok: false,
				contaminated: true,
				error: preflight.error,
				observed: preflight.observed,
				expected: preflight.expected,
				rows: []
			},
			409
		);
	}

	const rows = [];
	for (const t of targets) {
		const pageUrl = t.url.trim();
		const service = t.service.trim();
		const azure: LegResult = legs.includes("azure")
			? await azurePrepareLeg(c, pageUrl)
			: { ok: null, skip: true, detail: "skipped" };
		const cfFetch: LegResult = legs.includes("cfFetch")
			? await cfFetchLeg(pageUrl, service)
			: { ok: null, skip: true, detail: "skipped" };
		const cfBr: LegResult = legs.includes("cfBr")
			? await cfBrLeg(c, pageUrl, service)
			: { ok: null, skip: true, detail: "skipped" };
		const cfUsFetch: LegResult = legs.includes("cfUsFetch")
			? await cfUsFetchLeg(c, pageUrl, service)
			: { ok: null, skip: true, detail: "skipped" };

		const rec = recommend({
			azure: azure.ok,
			cfFetch: cfFetch.ok,
			cfBr: cfBr.ok,
			cfUsFetch: cfUsFetch.ok,
			azureSkip: azure.skip
		});

		rows.push({
			id: t.id,
			service,
			url: pageUrl,
			assumed: t.assumedTechnique ?? null,
			azure: azure.ok,
			azureDetail: azure.detail,
			cfFetch: cfFetch.ok,
			cfFetchDetail: cfFetch.detail,
			cfBr: cfBr.ok,
			cfBrDetail: cfBr.detail,
			cfUsFetch: cfUsFetch.ok,
			cfUsFetchDetail: cfUsFetch.detail,
			recommend: rec
		});
	}

	logCollector.emit({
		event: "ops.streaming_scrape_survey.ok",
		outcome: "success",
		status: 200
	});
	return c.json({
		ok: true,
		contaminated: false,
		preflight: preflight.traces,
		legs,
		rows
	});
}
