import { challengeLikely, DESKTOP_CHROME_UA } from "./browserRenderingHtml";

/** Catalogue GET timeout (ms). Fail fast so prepare can fall through to Azure. */
export const CATALOG_HTML_TIMEOUT_MS = 12_000;

/**
 * GET catalogue HTML from CF (geo) for Azure extract. Not BR salvage:
 * title-only HTML is returned so Azure can apply host title recovery.
 * Challenge / interstitial pages are a fetch miss.
 */
export async function fetchCatalogHtml(
	url: URL,
	addMessage: (message: string) => void
): Promise<string | null> {
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

		return html;
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		addMessage(`catalog html failed: ${detail}`);
		return null;
	}
}
