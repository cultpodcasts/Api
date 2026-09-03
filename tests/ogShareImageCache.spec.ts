import { describe, expect, it } from "vitest";
import {
	OG_IMAGE_CACHE_MAX_AGE_SECONDS,
	matchCachedOgImage,
	ogImageCacheControlHeader,
	ogImageCacheKey,
	putCachedOgImage,
	shouldPutOgImageInCache
} from "../src/ogShareImageCache";

function memoryCache() {
	const store = new Map<string, Response>();
	return {
		async match(request: RequestInfo | URL) {
			const key = request instanceof Request ? request.url : String(request);
			const cached = store.get(key);
			return cached ? cached.clone() : undefined;
		},
		async put(request: RequestInfo | URL, response: Response) {
			const key = request instanceof Request ? request.url : String(request);
			store.set(key, response.clone());
		}
	} as Pick<Cache, "match" | "put"> as Cache;
}

describe("OG image Workers Cache", () => {
	it("keeps a composed card for seven days", () => {
		expect(OG_IMAGE_CACHE_MAX_AGE_SECONDS).toBe(7 * 24 * 60 * 60);
		expect(ogImageCacheControlHeader()).toBe("public, max-age=604800");
		expect(ogImageCacheControlHeader()).not.toContain("max-age=86400");
	});

	it("keys the cache on the full GET URL including query", () => {
		const key = ogImageCacheKey("https://api.example/og-image?u=https://i.ytimg.com/x.jpg&a=wide&t=One");
		expect(key.method).toBe("GET");
		expect(key.url).toContain("a=wide");
		expect(key.url).toContain("t=One");
	});

	it("puts only 200 responses and returns HIT on match", async () => {
		expect(shouldPutOgImageInCache(200)).toBe(true);
		expect(shouldPutOgImageInCache(400)).toBe(false);
		expect(shouldPutOgImageInCache(307)).toBe(false);

		const cache = memoryCache();
		const url = "https://api.example/og-image?u=https://i.ytimg.com/x.jpg&a=wide";
		const png = new Response(new Uint8Array([1, 2, 3]), {
			status: 200,
			headers: { "Cache-Control": ogImageCacheControlHeader() }
		});
		await putCachedOgImage(cache, url, png);
		const hit = await matchCachedOgImage(cache, url);
		expect(hit).toBeDefined();
		expect(hit?.status).toBe(200);
		expect(hit?.headers.get("X-Og-Cache")).toBe("HIT");
		expect(new Uint8Array(await hit!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

		await putCachedOgImage(cache, url + "&miss=1", new Response(null, { status: 400 }));
		await putCachedOgImage(cache, url + "&redir=1", new Response(null, { status: 307 }));
		expect(await matchCachedOgImage(cache, url + "&miss=1")).toBeUndefined();
		expect(await matchCachedOgImage(cache, url + "&redir=1")).toBeUndefined();
	});
});
