/** Workers Cache TTL for a composed card. Same URL is not re-Satori'd. */
export const OG_IMAGE_CACHE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function ogImageCacheKey(requestUrl: string): Request {
	return new Request(requestUrl, { method: "GET" });
}
