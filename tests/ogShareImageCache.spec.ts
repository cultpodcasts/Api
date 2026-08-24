import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OG_IMAGE_CACHE_MAX_AGE_SECONDS, ogImageCacheKey } from "../src/ogShareImageCache";

const impl = readFileSync(resolve(process.cwd(), "src/ogShareImage.ts"), "utf8");

describe("OG image Workers Cache", () => {
	it("keeps a composed card for seven days", () => {
		expect(OG_IMAGE_CACHE_MAX_AGE_SECONDS).toBe(7 * 24 * 60 * 60);
		expect(impl).toContain("caches.default");
		expect(impl).toContain("cache.match");
		expect(impl).toContain("cache.put");
		expect(impl).toContain("X-Og-Cache");
		expect(impl).not.toContain("max-age=86400");
	});

	it("keys the cache on the full GET URL including query", () => {
		const key = ogImageCacheKey("https://api.example/og-image?u=https://i.ytimg.com/x.jpg&a=wide&t=One");
		expect(key.method).toBe("GET");
		expect(key.url).toContain("a=wide");
		expect(key.url).toContain("t=One");
	});

	it("does not put 4xx or 307 fallbacks into cache", () => {
		expect(impl).toContain("new Response(bytes, { status: 200, headers })");
		expect(impl).toContain('return c.text("Missing u (source image URL)", 400)');
		expect(impl).toContain("return Response.redirect(sourceUrl.toString(), 307)");
		expect(impl.indexOf('return c.text("Missing u')).toBeLessThan(impl.indexOf("cache.match"));
		expect(impl.indexOf("await cache.put")).toBeGreaterThan(impl.indexOf("new ImageResponse"));
		expect(impl.indexOf("await cache.put")).toBeLessThan(impl.lastIndexOf("status: 307"));
	});
});
