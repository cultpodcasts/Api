/** Workers Cache TTL for a composed card. Same URL is not re-Satori'd. */
export const OG_IMAGE_CACHE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function ogImageCacheKey(requestUrl: string): Request {
	return new Request(requestUrl, { method: "GET" });
}

export function ogImageCacheControlHeader(): string {
	return `public, max-age=${OG_IMAGE_CACHE_MAX_AGE_SECONDS}`;
}

/** Only successful composed PNGs are stored. 4xx and 307 fallbacks are not. */
export function shouldPutOgImageInCache(status: number): boolean {
	return status === 200;
}

export function withOgCacheHeader(response: Response, value: "HIT" | "MISS"): Response {
	const headers = new Headers(response.headers);
	headers.set("X-Og-Cache", value);
	return new Response(response.body, { status: response.status, headers });
}

export async function matchCachedOgImage(
	cache: Cache,
	requestUrl: string
): Promise<Response | undefined> {
	const cached = await cache.match(ogImageCacheKey(requestUrl));
	if (!cached) {
		return undefined;
	}
	return withOgCacheHeader(cached, "HIT");
}

export async function putCachedOgImage(
	cache: Cache,
	requestUrl: string,
	response: Response
): Promise<void> {
	if (!shouldPutOgImageInCache(response.status)) {
		return;
	}
	await cache.put(ogImageCacheKey(requestUrl), response.clone());
}
