import puppeteer, { type Browser, type BrowserWorker, type Page } from "@cloudflare/puppeteer";

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

/** Max wait to salvage title/content after the hard-cap timer fires. */
const SALVAGE_TIMEOUT_MS = 3_000;

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

/**
 * HTML looks extractable enough to try Azure extract despite a goto timeout /
 * hard-cap salvage. Requires SPA/catalogue signals (`og:title` or
 * `__NEXT_DATA__`); bare `<title>` alone is not enough (bot walls often have
 * one). Challenge / interstitial pages are never usable.
 */
export function isUsableBrowserHtml(html: string): boolean {
	if (html.length < 500) {
		return false;
	}
	if (challengeLikely(html)) {
		return false;
	}
	return /property=["']og:title["']/i.test(html) || html.includes("__NEXT_DATA__");
}

/** Race a promise against a timeout fallback; always clear the timer when settled. */
export function raceWithTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<T>((resolve) => {
		timeoutId = setTimeout(() => resolve(fallback), ms);
	});
	return Promise.race([promise.catch(() => fallback), timeoutPromise]).finally(() => {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
		}
	});
}

async function salvagePageContent(
	page: Page,
	mark: (label: string) => void
): Promise<{ html: string; title: string; finalUrl: string }> {
	const title = await raceWithTimeout(page.title(), SALVAGE_TIMEOUT_MS, "");
	mark("title");
	const html = await raceWithTimeout(page.content(), SALVAGE_TIMEOUT_MS, "");
	mark("content");
	let finalUrl = "";
	try {
		finalUrl = page.url();
	} catch {
		finalUrl = "";
	}
	return { html, title, finalUrl };
}

/**
 * Fetch page HTML via Cloudflare Browser Rendering (Puppeteer binding).
 * On navigate timeout / hard-cap, still salvages whatever `page.content()` has
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

	let browserRef: Browser | null = null;
	let pageRef: Page | null = null;
	let closedByRun = false;

	const buildResult = (
		html: string,
		title: string,
		finalUrl: string,
		gotoError?: string
	): BrowserRenderingFetchResult => ({
		html,
		diagnostics: {
			finalUrl: finalUrl || url,
			title,
			gotoError,
			challengeLikely: challengeLikely(html),
			documentStatus,
			redirectStatuses,
			marks,
			htmlLength: html.length
		}
	});

	const closeBrowser = async () => {
		if (!browserRef || closedByRun) {
			return;
		}
		try {
			await browserRef.close();
		} catch {
			/* ignore close races after timeout */
		}
		closedByRun = true;
		mark("closed");
	};

	const run = async (): Promise<BrowserRenderingFetchResult> => {
		const browser = await puppeteer.launch(browserBinding);
		browserRef = browser;
		mark("launched");
		try {
			const page = await browser.newPage();
			pageRef = page;
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

			const salvaged = await salvagePageContent(page, mark);
			return buildResult(salvaged.html, salvaged.title, salvaged.finalUrl, gotoError);
		} finally {
			try {
				await browser.close();
			} catch {
				/* ignore close races after timeout */
			}
			closedByRun = true;
			mark("closed");
		}
	};

	const runPromise = run();
	let hardCapTimer: ReturnType<typeof setTimeout> | undefined;
	const hardCapPromise = new Promise<never>((_, reject) => {
		hardCapTimer = setTimeout(
			() => reject(new Error(`hardCap ${HARD_CAP_MS}ms exceeded`)),
			HARD_CAP_MS
		);
	});

	try {
		return await Promise.race([runPromise, hardCapPromise]);
	} catch (e) {
		const fatal = e instanceof Error ? e.message : String(e);
		const isHardCap = /hardCap \d+ms exceeded/.test(fatal);
		mark(isHardCap ? "hard_cap" : "run_error");

		if (isHardCap && pageRef) {
			try {
				const salvaged = await salvagePageContent(pageRef, mark);
				await closeBrowser();
				return buildResult(salvaged.html, salvaged.title, salvaged.finalUrl || url, fatal);
			} catch {
				/* fall through to empty */
			}
		}

		await closeBrowser();
		return buildResult("", "", url, fatal);
	} finally {
		if (hardCapTimer !== undefined) {
			clearTimeout(hardCapTimer);
		}
		// Loser may still reject after the race settles — swallow so it is not unhandled.
		void runPromise.catch(() => {});
		void hardCapPromise.catch(() => {});
	}
}
