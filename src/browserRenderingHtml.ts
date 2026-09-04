import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";

/** Hard navigate timeout for prepare BR (ms). */
const GOTO_TIMEOUT_MS = 45_000;

/**
 * Brief settle after DOMContentLoaded so SPA shells (e.g. ITVX) can hydrate
 * enough markup for Azure extract. Avoids `networkidle0`, which often never
 * settles on catalogue pages with long-poll/analytics.
 */
const POST_DOM_SETTLE_MS = 1_500;

/**
 * Fetch page HTML via Cloudflare Browser Rendering (Puppeteer binding).
 */
export async function fetchHtmlWithBrowserRendering(
	browserBinding: BrowserWorker,
	url: string
): Promise<string> {
	const browser = await puppeteer.launch(browserBinding);
	try {
		const page = await browser.newPage();
		await page.goto(url, {
			waitUntil: "domcontentloaded",
			timeout: GOTO_TIMEOUT_MS
		});
		await new Promise((resolve) => setTimeout(resolve, POST_DOM_SETTLE_MS));
		return await page.content();
	} finally {
		await browser.close();
	}
}
