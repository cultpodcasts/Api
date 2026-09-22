import { describe, expect, it, vi } from "vitest";
import { resolveRegionalScrapeUrl, scrapeViaRegionalWorker } from "../src/regionalScrape";

describe("regionalScrape", () => {
	it("resolveRegionalScrapeUrl applies contract Peacock rewrite once", () => {
		const asset =
			"https://www.peacocktv.com/watch/asset/movies/sex-lies-and-the-college-cult/f45c2853-4230-3910-aa53-51ac37f5a788";
		const seo =
			"https://www.peacocktv.com/watch-online/movies/sex-lies-and-the-college-cult/f45c2853-4230-3910-aa53-51ac37f5a788";
		expect(resolveRegionalScrapeUrl({ service: "peacock", url: asset })).toEqual({
			requestUrl: seo,
			rewrittenTo: seo
		});
		expect(resolveRegionalScrapeUrl({ service: "hulu", url: asset })).toEqual({
			requestUrl: asset,
			rewrittenTo: null
		});
	});

	it("scrapeViaRegionalWorker POSTs the rewritten URL to the scrape Worker", async () => {
		const asset =
			"https://www.peacocktv.com/watch/asset/movies/sex-lies-and-the-college-cult/f45c2853-4230-3910-aa53-51ac37f5a788";
		const seo =
			"https://www.peacocktv.com/watch-online/movies/sex-lies-and-the-college-cult/f45c2853-4230-3910-aa53-51ac37f5a788";
		const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as { url: string };
			expect(body.url).toBe(seo);
			return new Response(
				JSON.stringify({
					ok: true,
					html: "<html>" + "x".repeat(500) + "</html>",
					finalUrl: seo,
					title: "Movie | Peacock"
				}),
				{ status: 200 }
			);
		});
		const result = await scrapeViaRegionalWorker(
			{ fetch },
			{ url: asset, mode: "directHttp", service: "peacock" }
		);
		expect(result.requestUrl).toBe(seo);
		expect(result.rewrittenTo).toBe(seo);
		expect(fetch).toHaveBeenCalledOnce();
	});
});
