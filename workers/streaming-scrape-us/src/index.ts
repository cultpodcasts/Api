import type { BrowserWorker } from "@cloudflare/puppeteer";
import {
	fetchHtmlWithBrowserRendering,
	isUsableBrowserHtml,
	type BrowserRenderingDiagnostics
} from "../../src/browserRenderingHtml";
import { fetchCatalogHtml } from "../../src/catalogHtmlPrepare";
import type { HtmlFetchMode } from "../../tests/fixtures/streaming-submit-contract";

export type ScrapeRequest = {
	url: string;
	mode: HtmlFetchMode;
	/** Streaming service key for logging / shell checks (optional). */
	service?: string;
};

export type ScrapeResponse = {
	ok: boolean;
	html?: string;
	finalUrl?: string;
	title?: string;
	error?: string;
	placement?: {
		cfPlacement: string | null;
		colo: string | null;
		country: string | null;
	};
	diagnostics?: BrowserRenderingDiagnostics;
};

type Env = {
	BROWSER?: BrowserWorker;
};

function placementFromRequest(request: Request): ScrapeResponse["placement"] {
	const cf = request.cf as { colo?: string; country?: string } | undefined;
	return {
		cfPlacement: request.headers.get("cf-placement"),
		colo: cf?.colo ?? null,
		country: cf?.country ?? null
	};
}

/**
 * US-placed scrape Worker: catalogue HTML via Browser Rendering or direct HTTP.
 * Callable only via service binding from Api (no Auth0).
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== "POST") {
			return Response.json({ ok: false, error: "POST required" }, { status: 405 });
		}

		let body: ScrapeRequest;
		try {
			body = (await request.json()) as ScrapeRequest;
		} catch {
			return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
		}

		const pageUrl = body.url?.trim();
		if (!pageUrl) {
			return Response.json({ ok: false, error: "url is required" }, { status: 400 });
		}
		let absolute: URL;
		try {
			absolute = new URL(pageUrl);
		} catch {
			return Response.json({ ok: false, error: "url must be absolute" }, { status: 400 });
		}
		if (absolute.protocol !== "http:" && absolute.protocol !== "https:") {
			return Response.json({ ok: false, error: "url must be http(s)" }, { status: 400 });
		}

		const mode: HtmlFetchMode =
			body.mode === "browserRendering" ? "browserRendering" : "directHttp";
		const placement = placementFromRequest(request);

		if (mode === "browserRendering") {
			if (!env.BROWSER) {
				return Response.json(
					{ ok: false, error: "Browser Rendering binding is not configured", placement },
					{ status: 500 }
				);
			}
			try {
				const br = await fetchHtmlWithBrowserRendering(env.BROWSER, pageUrl);
				const d = br.diagnostics;
				if (!isUsableBrowserHtml(br.html)) {
					const payload: ScrapeResponse = {
						ok: false,
						error: "Browser Rendering returned unusable HTML",
						finalUrl: d.finalUrl,
						title: d.title,
						placement,
						diagnostics: d
					};
					return Response.json(payload, { status: 502 });
				}
				const payload: ScrapeResponse = {
					ok: true,
					html: br.html,
					finalUrl: d.finalUrl,
					title: d.title,
					placement,
					diagnostics: d
				};
				return Response.json(payload);
			} catch (e) {
				const detail = e instanceof Error ? e.message : String(e);
				return Response.json(
					{ ok: false, error: detail, placement },
					{ status: 502 }
				);
			}
		}

		const messages: string[] = [];
		const html = await fetchCatalogHtml(absolute, (m) => messages.push(m));
		if (!html) {
			return Response.json(
				{
					ok: false,
					error: messages.join("; ") || "directHttp catalogue fetch failed",
					placement
				},
				{ status: 502 }
			);
		}
		return Response.json({
			ok: true,
			html,
			finalUrl: pageUrl,
			title: "",
			placement
		} satisfies ScrapeResponse);
	}
};
