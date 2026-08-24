/**
 * Share-preview image helpers.
 * Search-index `image` uses SearchEpisodeImage compaction (y{q} / s{id} / a{n}{path} / full URL).
 * KV shortener metadata stores that encoding + youtubeId; page-details expands to an absolute
 * HTTPS URL for og:image / twitter:image.
 *
 * Aspect for `/og-image` canvas (website always uses twitter:card summary_large_image
 * when episode art is shown; site-icon fallback stays summary):
 * - YouTube / BBC iPlayer / Internet Archive → wide
 * - Spotify / Apple / BBC Sounds → square
 */

const youtubeQualityByCode: Record<string, string> = {
	x: "maxresdefault",
	s: "sddefault",
	h: "hqdefault",
	m: "mqdefault",
	d: "default"
};

export type EpisodeShareImageAspect = "wide" | "square";

export type EpisodeShareImage = {
	/** Absolute HTTPS URL for social crawlers. */
	image: string;
	imageAspect: EpisodeShareImageAspect;
};

/** Fields persisted on shortener KV (search-index encoding, not absolute URL). */
export type EpisodeShareImageStorage = {
	/** Search-index image token or full URL (same as Azure Search `image`). */
	image: string;
	youtubeId?: string;
	imageAspect: EpisodeShareImageAspect;
};

export type SearchEpisodeImageFields = {
	image?: string | null;
	youtubeId?: string | null;
	bbc?: string | null;
	internetArchive?: string | null;
};

/** Loss-less inverse of SearchEpisodeImage compaction (mirrors website expandImage). */
export function expandSearchImage(
	image: string | undefined | null,
	youtubeId: string | undefined | null
): string | undefined {
	if (!image) {
		return undefined;
	}
	if (image.startsWith("http")) {
		return image;
	}

	const payload = image.slice(1);
	switch (image[0]) {
		case "y": {
			const quality = youtubeQualityByCode[payload];
			return quality && youtubeId
				? `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/${quality}.jpg`
				: undefined;
		}
		case "s":
			return payload ? `https://i.scdn.co/image/${payload}` : undefined;
		case "a":
			return payload
				? `https://is${payload[0]}-ssl.mzstatic.com/image/thumb/${payload.slice(1)}`
				: undefined;
		default:
			return undefined;
	}
}

function isYoutubeThumbnailTokenOrUrl(image: string | undefined): boolean {
	if (!image) {
		return false;
	}
	if (image.length >= 2 && image[0] === "y" && image[1] in youtubeQualityByCode) {
		return true;
	}
	try {
		return new URL(image).hostname === "i.ytimg.com";
	} catch {
		return false;
	}
}

function youtubeThumbnailUrl(youtubeId: string): string {
	return `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`;
}

/** Mirrors website BBCServiceResolver.isIplayer (video → wide card). */
function isBbcIplayerUrl(value: string | null | undefined): boolean {
	if (!value) {
		return false;
	}
	try {
		const url = new URL(value);
		const host = url.hostname;
		const isBbc = host.endsWith("bbc.com") || host.endsWith("bbc.co.uk");
		return isBbc && (url.pathname.startsWith("/iplayer/") || url.pathname.startsWith("/news/av-embeds/"));
	} catch {
		return false;
	}
}

/**
 * Display URL for share previews — mirrors website episodeImageUrl for search hits:
 * prefer YouTube frame when youtubeId is set; else expand the search-index image value.
 */
export function resolveShareImageAbsoluteUrl(episode: SearchEpisodeImageFields): string | undefined {
	if (isYoutubeThumbnailTokenOrUrl(episode.image ?? undefined)) {
		return expandSearchImage(episode.image, episode.youtubeId);
	}
	if (episode.youtubeId) {
		return youtubeThumbnailUrl(episode.youtubeId);
	}
	return expandSearchImage(episode.image, episode.youtubeId);
}

export function resolveShareImageAspect(
	absoluteImage: string,
	episode: SearchEpisodeImageFields
): EpisodeShareImageAspect {
	if (isYoutubeThumbnailTokenOrUrl(absoluteImage) || episode.youtubeId) {
		return "wide";
	}
	if (isBbcIplayerUrl(episode.bbc) || episode.internetArchive) {
		return "wide";
	}
	return "square";
}

/** Absolute image URL + card aspect for crawlers / page-details response. */
export function resolveEpisodeShareImage(episode: SearchEpisodeImageFields): EpisodeShareImage | undefined {
	const absolute = resolveShareImageAbsoluteUrl(episode);
	if (!absolute) {
		return undefined;
	}
	return {
		image: absolute,
		imageAspect: resolveShareImageAspect(absolute, episode)
	};
}

/**
 * What to persist on shortener KV: search-index `image` encoding (+ youtubeId for y{q} expand).
 * Falls back to absolute URL only when there is no search image but youtubeId still yields a frame.
 */
export function toShareImageStorage(episode: SearchEpisodeImageFields): EpisodeShareImageStorage | undefined {
	const absolute = resolveShareImageAbsoluteUrl(episode);
	if (!absolute) {
		return undefined;
	}
	const imageAspect = resolveShareImageAspect(absolute, episode);
	const searchImage = episode.image?.trim();
	if (searchImage) {
		return {
			image: searchImage,
			youtubeId: episode.youtubeId || undefined,
			imageAspect
		};
	}
	// Invented YouTube hqdefault when index had no image — store absolute (not a search token).
	return {
		image: absolute,
		youtubeId: episode.youtubeId || undefined,
		imageAspect
	};
}

/** Expand KV/search storage back to absolute share URL (+ aspect). */
export function shareImageFromStorage(stored: {
	image?: string | null;
	youtubeId?: string | null;
	imageAspect?: EpisodeShareImageAspect | null;
	bbc?: string | null;
	internetArchive?: string | null;
}): EpisodeShareImage | undefined {
	const absolute = resolveShareImageAbsoluteUrl(stored);
	if (!absolute) {
		return undefined;
	}
	return {
		image: absolute,
		imageAspect: stored.imageAspect ?? resolveShareImageAspect(absolute, stored)
	};
}

/** Logo URL legacy constant — site icon fallback when no share art. */
export const DEFAULT_OG_LOGO_URL = "https://cultpodcasts.com/assets/sq-image.png";

export type OgCardMeta = {
	title?: string;
	podcast?: string;
	duration?: string;
	date?: string;
	/** Comma-separated: youtube,spotify,apple,bbc */
	platforms?: string;
};

const ALLOWED_SHARE_IMAGE_HOST_SUFFIXES = [
	"i.ytimg.com",
	"i.scdn.co",
	"mzstatic.com",
	"archive.org",
	"bbci.co.uk",
	"bbcimg.co.uk",
	"bbc.co.uk",
	"staticflickr.com"
];

export function isAllowedShareImageSourceHost(hostname: string): boolean {
	const host = hostname.toLowerCase();
	return ALLOWED_SHARE_IMAGE_HOST_SUFFIXES.some(
		(suffix) => host === suffix || host.endsWith(`.${suffix}`)
	);
}

export function parseOgImageAspect(value: string | undefined | null): EpisodeShareImageAspect {
	return value === "wide" ? "wide" : "square";
}

/**
 * Page-details `image` for crawlers: Api Worker URL that composes the OG card
 * (art + brand type + meta + platforms). Falls back to the raw source if render fails.
 */
export function buildBrandedOgImageUrl(
	apiRequestUrl: string,
	sourceImageAbsoluteUrl: string,
	aspect: EpisodeShareImageAspect = "square",
	meta?: OgCardMeta
): string {
	const origin = new URL(apiRequestUrl).origin;
	const url = new URL("/og-image", origin);
	url.searchParams.set("u", sourceImageAbsoluteUrl);
	url.searchParams.set("a", aspect);
	if (meta?.title) {
		url.searchParams.set("t", meta.title);
	}
	if (meta?.podcast) {
		url.searchParams.set("p", meta.podcast);
	}
	if (meta?.duration) {
		url.searchParams.set("d", meta.duration);
	}
	if (meta?.date) {
		url.searchParams.set("r", meta.date);
	}
	if (meta?.platforms) {
		url.searchParams.set("pl", meta.platforms);
	}
	return url.toString();
}
