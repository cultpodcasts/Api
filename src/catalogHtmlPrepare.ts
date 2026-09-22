import { challengeLikely, DESKTOP_CHROME_UA } from "./browserRenderingHtml";

/** Catalogue GET timeout (ms). Fail fast so prepare can fall through to Azure. */
export const CATALOG_HTML_TIMEOUT_MS = 12_000;

export type CatalogHtmlResult = {
	html: string;
	/** URL after `redirect: "follow"` (`Response.url`), else the request URL. */
	finalUrl: string;
};

/** Prefer og:title, then document `<title>`, for scrape diagnostics / shells. */
export function titleFromCatalogHtml(html: string): string {
	const og = html.match(
		/(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i
	);
	if (og?.[1]) {
		return og[1].trim();
	}
	const doc = html.match(/<title>([^<]*)<\/title>/i);
	return doc?.[1]?.trim() ?? "";
}

/**
 * GET catalogue HTML from CF (geo) for Azure extract. Not BR salvage:
 * title-only HTML is returned so Azure can apply host title recovery.
 * Challenge / interstitial pages are a fetch miss.
 */
export async function fetchCatalogHtml(
	url: URL,
	addMessage: (message: string) => void
): Promise<CatalogHtmlResult | null> {
	try {
		const resp = await fetch(url.toString(), {
			headers: {
				Accept: "text/html,application/xhtml+xml",
				"User-Agent": DESKTOP_CHROME_UA
			},
			redirect: "follow",
			signal: AbortSignal.timeout(CATALOG_HTML_TIMEOUT_MS)
		});
		addMessage(`catalog html status=${resp.status} host=${url.host}`);
		if (!resp.ok) {
			return null;
		}

		const html = await resp.text();
		if (challengeLikely(html)) {
			addMessage("catalog html challenge");
			return null;
		}

		const finalUrl = resp.url?.trim() || url.toString();
		if (finalUrl !== url.toString()) {
			addMessage(`catalog html finalUrl=${finalUrl}`);
		}
		return { html, finalUrl };
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		addMessage(`catalog html failed: ${detail}`);
		return null;
	}
}
