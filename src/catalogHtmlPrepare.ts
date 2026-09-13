import { DESKTOP_CHROME_UA, isUsableBrowserHtml } from "./browserRenderingHtml";

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
			signal: AbortSignal.timeout(12_000)
		});
		addMessage(`catalog html status=${resp.status} host=${url.host}`);
		if (!resp.ok) {
			return null;
		}

		const html = await resp.text();
		if (!isUsableBrowserHtml(html)) {
			addMessage("catalog html not usable");
			return null;
		}

		return html;
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		addMessage(`catalog html failed: ${detail}`);
		return null;
	}
}
