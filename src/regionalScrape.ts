import type { HtmlFetchMode } from "./streamingHtmlFetchMode";

export type RegionalScrapeResult = {
	html: string;
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
 * POST catalogue scrape to a regional scrape Worker (service binding).
 */
export async function scrapeViaRegionalWorker(
	worker: ScrapeWorkerFetcher,
	opts: { url: string; mode: HtmlFetchMode; service: string }
): Promise<RegionalScrapeResult> {
	const resp = await worker.fetch("https://scrape.internal/", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			url: opts.url,
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
		finalUrl: body.finalUrl ?? d?.finalUrl ?? opts.url,
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
