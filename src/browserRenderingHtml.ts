import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";

/** Navigate timeout for prepare BR (ms). Prefer fail-fast over 45s hangs. */
const GOTO_TIMEOUT_MS = 20_000;

/**
 * Brief settle after DOMContentLoaded so SPA shells (e.g. ITVX) can hydrate
 * enough markup for Azure extract. Avoids `networkidle0`, which often never
 * settles on catalogue pages with long-poll/analytics.
 */
const POST_DOM_SETTLE_MS = 1_500;

/** Cap total BR wall time so a wedged session still returns partial HTML. */
const HARD_CAP_MS = 28_000;

export type BrowserRenderingMark = { label: string; tMs: number };

export type BrowserRenderingDiagnostics = {
	finalUrl: string;
	title: string;
	gotoError?: string;
	challengeLikely: boolean;
	documentStatus?: number;
	redirectStatuses: number[];
	marks: BrowserRenderingMark[];
	htmlLength: number;
};

export type BrowserRenderingFetchResult = {
	html: string;
	diagnostics: BrowserRenderingDiagnostics;
};

function challengeLikely(html: string): boolean {
	return (
		/just a moment/i.test(html) ||
		/cf-browser-verification/i.test(html) ||
		/challenge-platform/i.test(html) ||
		/Enable JavaScript and cookies/i.test(html) ||
		/Attention Required/i.test(html) ||
		/bot.?detect/i.test(html)
	);
}

/** HTML looks extractable enough to try Azure extract despite a goto timeout. */
export function isUsableBrowserHtml(html: string): boolean {
	if (html.length < 500) {
		return false;
	}
	return (
		/property=["']og:title["']/i.test(html) ||
		html.includes("__NEXT_DATA__") ||
		/<title[^>]*>\s*[^<\s]/i.test(html)
	);
}

/**
 * Fetch page HTML via Cloudflare Browser Rendering (Puppeteer binding).
 * On navigate timeout / hard-cap, still returns whatever `page.content()` has
 * plus timing / document status diagnostics for Workers Logs.
 */
export async function fetchHtmlWithBrowserRendering(
	browserBinding: BrowserWorker,
	url: string
): Promise<BrowserRenderingFetchResult> {
	const t0 = Date.now();
	const marks: BrowserRenderingMark[] = [{ label: "start", tMs: 0 }];
	const mark = (label: string) => {
		marks.push({ label, tMs: Date.now() - t0 });
	};

	let documentStatus: number | undefined;
	const redirectStatuses: number[] = [];

	const run = async (): Promise<BrowserRenderingFetchResult> => {
		const browser = await puppeteer.launch(browserBinding);
		mark("launched");
		try {
			const page = await browser.newPage();
			page.on("response", (res) => {
				const status = res.status();
				const type = res.request().resourceType();
				if (type === "document" && documentStatus === undefined) {
					documentStatus = status;
					mark(`document_${status}`);
				}
				if (status >= 300 && status < 400 && redirectStatuses.length < 8) {
					redirectStatuses.push(status);
				}
			});

			let gotoError: string | undefined;
			try {
				await page.goto(url, {
					waitUntil: "domcontentloaded",
					timeout: GOTO_TIMEOUT_MS
				});
				mark("goto_ok");
			} catch (e) {
				gotoError = e instanceof Error ? e.message : String(e);
				mark("goto_error");
			}

			if (!gotoError) {
				await new Promise((resolve) => setTimeout(resolve, POST_DOM_SETTLE_MS));
				mark("settled");
			}

			const title = await page.title().catch(() => "");
			mark("title");
			const html = await page.content().catch(() => "");
			mark("content");
			const finalUrl = page.url();

			return {
				html,
				diagnostics: {
					finalUrl,
					title,
					gotoError,
					challengeLikely: challengeLikely(html),
					documentStatus,
					redirectStatuses,
					marks,
					htmlLength: html.length
				}
			};
		} finally {
			try {
				await browser.close();
			} catch {
				/* ignore close races after timeout */
			}
			mark("closed");
		}
	};

	try {
		return await Promise.race([
			run(),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error(`hardCap ${HARD_CAP_MS}ms exceeded`)), HARD_CAP_MS)
			)
		]);
	} catch (e) {
		const fatal = e instanceof Error ? e.message : String(e);
		mark("hard_cap");
		return {
			html: "",
			diagnostics: {
				finalUrl: url,
				title: "",
				gotoError: fatal,
				challengeLikely: false,
				documentStatus,
				redirectStatuses,
				marks,
				htmlLength: 0
			}
		};
	}
}
