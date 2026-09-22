/**
 * Peacock signed-in catalogue paths (`/watch/asset/...`) soft-wall without a
 * session. Public US SEO twins live under `/watch-online/...` with the same
 * slug + ids — rewrite before SCRAPE_US so prepare can read SSR meta.
 */

const UUID =
	/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const NUMERIC_ID = /^\d{6,}$/;

function isPeacockHost(hostname: string): boolean {
	const h = hostname.toLowerCase();
	return h === "peacocktv.com" || h.endsWith(".peacocktv.com");
}

function isAssetId(segment: string): boolean {
	return NUMERIC_ID.test(segment) || UUID.test(segment);
}

function isCatalogueSegment(segment: string): boolean {
	return segment.length > 0 && !segment.includes(".");
}

/** True when path is already a public SEO catalogue URL. */
export function isPeacockWatchOnlineUrl(url: string): boolean {
	try {
		const u = new URL(url);
		if (!isPeacockHost(u.hostname)) {
			return false;
		}
		const parts = u.pathname.split("/").filter(Boolean);
		return isWatchOnlineParts(parts);
	} catch {
		return false;
	}
}

function isWatchOnlineParts(parts: string[]): boolean {
	if (
		parts.length < 4 ||
		parts[0].toLowerCase() !== "watch-online" ||
		!isCatalogueSegment(parts[2]) ||
		!isAssetId(parts[3])
	) {
		return false;
	}
	const kind = parts[1].toLowerCase();
	if (kind === "movies") {
		return parts.length === 4;
	}
	if (kind !== "tv") {
		return false;
	}
	if (parts.length === 4) {
		return true;
	}
	return (
		parts.length >= 9 &&
		parts[4].toLowerCase() === "seasons" &&
		isCatalogueSegment(parts[5]) &&
		parts[6].toLowerCase() === "episodes" &&
		isCatalogueSegment(parts[7]) &&
		isAssetId(parts[8])
	);
}

/**
 * Rewrite `/watch/asset/...` → `/watch-online/...` when the asset path is a
 * catalogue title/episode. Returns null when already SEO or not rewritable
 * (playback, shells, unknown kinds).
 */
export function toPeacockWatchOnlineUrl(url: string): string | null {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return null;
	}
	if (!isPeacockHost(u.hostname)) {
		return null;
	}

	const parts = u.pathname.split("/").filter(Boolean);
	if (parts[0]?.toLowerCase() === "watch-online") {
		return null;
	}
	if (
		parts.length < 5 ||
		parts[0].toLowerCase() !== "watch" ||
		parts[1].toLowerCase() !== "asset" ||
		!isCatalogueSegment(parts[3]) ||
		!isAssetId(parts[4])
	) {
		return null;
	}

	const rawKind = parts[2].toLowerCase();
	const kind = rawKind === "movie" ? "movies" : rawKind;
	if (kind !== "tv" && kind !== "movies") {
		return null;
	}

	const seoParts = ["watch-online", kind, ...parts.slice(3)];
	if (!isWatchOnlineParts(seoParts)) {
		return null;
	}

	const out = new URL(u.href);
	out.pathname = `/${seoParts.join("/")}`;
	out.search = "";
	out.hash = "";
	return out.toString();
}

/** URL to fetch for Peacock prepare (SEO twin when submitted asset). */
export function peacockPrepareFetchUrl(url: string): string {
	return toPeacockWatchOnlineUrl(url) ?? url;
}
