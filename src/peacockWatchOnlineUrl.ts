/**
 * Peacock prepare-fetch URL helpers — policy + rewrite live in the streaming
 * submit contract (`prepareUrlRewrites` / `resolvePrepareFetchUrl`).
 */
export {
	resolvePrepareFetchUrl,
	toPeacockWatchOnlineUrl,
	type PrepareFetchUrlResolution,
	type PrepareUrlRewriteSpec
} from "../tests/fixtures/streaming-submit-contract";
import { toPeacockWatchOnlineUrl } from "../tests/fixtures/streaming-submit-contract";

/** URL to fetch for Peacock prepare (SEO twin when submitted asset). */
export function peacockPrepareFetchUrl(url: string): string {
	return toPeacockWatchOnlineUrl(url) ?? url;
}

/**
 * True when the URL is already under Peacock's public SEO path prefix
 * (`/watch-online/`). Does not prove catalogue shape — use rewrite null +
 * submit matcher for that.
 */
export function isPeacockWatchOnlineUrl(url: string): boolean {
	try {
		const u = new URL(url);
		const h = u.hostname.toLowerCase();
		if (h !== "peacocktv.com" && !h.endsWith(".peacocktv.com")) {
			return false;
		}
		const parts = u.pathname.split("/").filter(Boolean);
		return parts[0]?.toLowerCase() === "watch-online";
	} catch {
		return false;
	}
}
