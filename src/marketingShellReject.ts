/**
 * Reject geo / marketing soft-wall HTML before Azure extract so prepare
 * cannot create junk episodes (e.g. Hulu → Disney+ homepage,
 * Peacock → signin / browser-not-supported).
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

	if (service === "peacock" && submittedHost?.endsWith("peacocktv.com")) {
		if (finalHost && finalHost.includes("peacocktv.com")) {
			const path = (() => {
				try {
					return new URL(check.finalUrl!).pathname.toLowerCase();
				} catch {
					return "";
				}
			})();
			if (
				path.startsWith("/signin") ||
				path.includes("browser-not-supported") ||
				path.includes("/webwatch/release/")
			) {
				return true;
			}
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

	if (service === "peacock") {
		const t = title.trim();
		if (
			/^Peacock$/i.test(t) ||
			/^Peacock\s*[-–—]\s*Update your browser/i.test(t) ||
			/^Peacock Not Found$/i.test(t)
		) {
			return true;
		}
	}

	return false;
}
