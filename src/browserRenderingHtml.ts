import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";

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
		await page.goto(url, { waitUntil: "networkidle0", timeout: 45_000 });
		return await page.content();
	} finally {
		await browser.close();
	}
}
