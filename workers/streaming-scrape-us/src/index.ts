import { fetchCatalogHtml } from "../../../src/catalogHtmlPrepare";
import type { HtmlFetchMode } from "../../../tests/fixtures/streaming-submit-contract";

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
};

type Env = Record<string, never>;

function placementFromRequest(request: Request): ScrapeResponse["placement"] {
	const cf = request.cf as { colo?: string; country?: string } | undefined;
	return {
		cfPlacement: request.headers.get("cf-placement"),
		colo: cf?.colo ?? null,
		country: cf?.country ?? null
	};
}

/**
 * US-placed scrape Worker: catalogue HTML via direct HTTP only.
 * Browser Rendering is edge-Api (ITVX hydration) — never a geo tool.
 * Callable only via service binding from Api (no Auth0).
 */
export default {
	async fetch(request: Request, _env: Env): Promise<Response> {
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

		const placement = placementFromRequest(request);

		if (body.mode === "browserRendering") {
			return Response.json(
				{
					ok: false,
					error:
						"browserRendering is not supported on the US scrape Worker; use edge Api BR for hydration, directHttp for geo",
					placement
				} satisfies ScrapeResponse,
				{ status: 422 }
			);
		}

		const mode: HtmlFetchMode = "directHttp";
		if (body.mode && body.mode !== mode) {
			return Response.json(
				{ ok: false, error: `unsupported mode ${body.mode}`, placement },
				{ status: 400 }
			);
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
