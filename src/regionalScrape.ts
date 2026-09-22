import type { HtmlFetchMode } from "./streamingHtmlFetchMode";
import { resolvePrepareFetchUrl } from "./streamingHtmlFetchMode";

export type RegionalScrapeResult = {
	html: string;
	/** URL actually sent to the regional scrape Worker (after contract rewrites). */
	requestUrl: string;
	/** Non-null when {@link resolvePrepareFetchUrl} rewrote the catalogue URL. */
	rewrittenTo: string | null;
	finalUrl: string;
	title: string;
	placement: {
		cfPlacement: string | null;
		colo: string | null;
		country: string | null;
	} | null;
	diagnosticsMarks?: string;
	gotoError?: string | null;
	documentStatus?: number | null;
	redirectStatuses?: number[];
	challengeLikely?: boolean;
	htmlLength?: number;
};

type ScrapeWorkerFetcher = {
	fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

/**
 * Resolve the catalogue URL to fetch for a regional scrape.
 * Uses contract {@link resolvePrepareFetchUrl} (single rewrite site for prepare + survey).
 */
export function resolveRegionalScrapeUrl(opts: {
	url: string;
	service: string;
}): { requestUrl: string; rewrittenTo: string | null } {
	return resolvePrepareFetchUrl(opts.service, opts.url);
}

/**
 * POST catalogue scrape to a regional scrape Worker (service binding).
 * Applies contract prepare URL rewrites (e.g. Peacock asset → watch-online).
 */
export async function scrapeViaRegionalWorker(
	worker: ScrapeWorkerFetcher,
	opts: { url: string; mode: HtmlFetchMode; service: string }
): Promise<RegionalScrapeResult> {
	const { requestUrl, rewrittenTo } = resolveRegionalScrapeUrl(opts);
	const resp = await worker.fetch("https://scrape.internal/", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			url: requestUrl,
			mode: opts.mode,
			service: opts.service
		})
	});
	const body = (await resp.json()) as {
		ok?: boolean;
		html?: string;
		finalUrl?: string;
		title?: string;
		error?: string;
		placement?: RegionalScrapeResult["placement"];
		diagnostics?: {
			marks?: { label: string; tMs: number }[];
			gotoError?: string;
			documentStatus?: number;
			redirectStatuses?: number[];
			challengeLikely?: boolean;
			htmlLength?: number;
			finalUrl?: string;
			title?: string;
		};
	};

	if (!resp.ok || !body.ok || !body.html) {
		throw new Error(
			body.error ||
				`Regional scrape failed status=${resp.status} service=${opts.service}`
		);
	}

	const d = body.diagnostics;
	return {
		html: body.html,
		requestUrl,
		rewrittenTo,
		finalUrl: body.finalUrl ?? d?.finalUrl ?? requestUrl,
		title: body.title ?? d?.title ?? "",
		placement: body.placement ?? null,
		diagnosticsMarks: d?.marks?.map((m) => `${m.label}:${m.tMs}`).join(","),
		gotoError: d?.gotoError ?? null,
		documentStatus: d?.documentStatus ?? null,
		redirectStatuses: d?.redirectStatuses,
		challengeLikely: d?.challengeLikely,
		htmlLength: d?.htmlLength ?? body.html.length
	};
}
