/**
 * Reject geo / marketing soft-wall HTML before Azure extract so prepare
 * cannot create junk episodes (e.g. Hulu → Disney+ homepage).
 */

export type MarketingShellCheck = {
	/** Streaming service key from lookup (e.g. hulu). */
	service: string;
	/** Submitted catalogue URL. */
	submittedUrl: string;
	/** Final URL after redirects (Browser Rendering / fetch). */
	finalUrl?: string | null;
	/** Document / og title from scrape diagnostics when known. */
	title?: string | null;
	html: string;
};

function hostOf(url: string): string | null {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return null;
	}
}

function titleLooksLikeDisneyMarketing(title: string): boolean {
	const t = title.trim();
	if (!t) {
		return false;
	}
	return (
		/^Disney\+/i.test(t) ||
		/Stream Movies,\s*TV Shows/i.test(t) ||
		/Disney\+\s+United Kingdom/i.test(t) ||
		/Watch new Originals,\s*blockbusters/i.test(t)
	);
}

/**
 * True when scraped content is a Disney+/Hulu marketing shell rather than the
 * submitted catalogue page.
 */
export function isMarketingShellHtml(check: MarketingShellCheck): boolean {
	const service = check.service.trim().toLowerCase();
	if (service !== "hulu" && service !== "peacock" && service !== "disneyplus") {
		return false;
	}

	const submittedHost = hostOf(check.submittedUrl);
	const finalHost = check.finalUrl ? hostOf(check.finalUrl) : null;

	if (service === "hulu" && submittedHost?.endsWith("hulu.com")) {
		if (finalHost && !finalHost.endsWith("hulu.com")) {
			return true;
		}
	}

	const title =
		check.title?.trim() ||
		(() => {
			const og = check.html.match(
				/(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i
			);
			if (og?.[1]) {
				return og[1];
			}
			const doc = check.html.match(/<title>([^<]*)<\/title>/i);
			return doc?.[1] ?? "";
		})();

	if (titleLooksLikeDisneyMarketing(title)) {
		return true;
	}

	return false;
}
