import { describe, expect, it } from "vitest";
import { isMarketingShellHtml } from "../src/marketingShellReject";

describe("isMarketingShellHtml", () => {
	it("ignores services other than Peacock/Disney+", () => {
		expect(
			isMarketingShellHtml({
				service: "itvx",
				submittedUrl: "https://www.itv.com/watch/x",
				finalUrl: "https://www.disneyplus.com/",
				title: "Disney+",
				html: "<title>Disney+</title>"
			})
		).toBe(false);
		expect(
			isMarketingShellHtml({
				service: "hulu",
				submittedUrl: "https://www.hulu.com/series/x",
				finalUrl: "https://www.disneyplus.com/",
				title: "Disney+ | Stream Movies, TV Shows, and Originals",
				html: "<html><title>Disney+</title></html>"
			})
		).toBe(false);
	});

	it("rejects Disney+ marketing title when service is disneyPlus", () => {
		expect(
			isMarketingShellHtml({
				service: "disneyPlus",
				submittedUrl: "https://www.disneyplus.com/series/example",
				finalUrl: "https://www.disneyplus.com/",
				title: "Disney+ | Stream Movies, TV Shows, and Originals",
				html: "<html><title>Disney+</title></html>"
			})
		).toBe(true);
	});

	it("rejects Disney+ United Kingdom soft-wall title", () => {
		expect(
			isMarketingShellHtml({
				service: "disneyPlus",
				submittedUrl: "https://www.disneyplus.com/series/example",
				finalUrl: "https://www.disneyplus.com/en-gb",
				title: "Watch new Originals, blockbusters and series - Disney+ United Kingdom",
				html: "<html><title>Watch new Originals, blockbusters and series - Disney+ United Kingdom</title></html>"
			})
		).toBe(true);
	});

	const peacockUrl = "https://www.peacocktv.com/watch/asset/tv/the-office/5568795438602876112";

	it("rejects Peacock signin soft-wall", () => {
		expect(
			isMarketingShellHtml({
				service: "peacock",
				submittedUrl: peacockUrl,
				finalUrl: "https://www.peacocktv.com/signin?return=%2Fwatch%2Fasset%2Ftv%2Fthe-office%2F5568795438602876112",
				title: "Peacock",
				html: "<html><title>Peacock</title></html>"
			})
		).toBe(true);
	});

	it("rejects Peacock browser-not-supported page", () => {
		expect(
			isMarketingShellHtml({
				service: "peacock",
				submittedUrl: peacockUrl,
				finalUrl:
					"https://www.peacocktv.com/webwatch/release/prod/static/browser-not-supported/browser-nbcuott.ff5fdccf.html",
				title: "Peacock - Update your browser",
				html: "<html><title>Peacock - Update your browser</title></html>"
			})
		).toBe(true);
	});

	it("rejects Peacock Not Found shell", () => {
		expect(
			isMarketingShellHtml({
				service: "peacock",
				submittedUrl: peacockUrl,
				finalUrl: "https://www.peacocktv.com/stream/tv/the-office/5568795438602876112",
				title: "Peacock Not Found",
				html: "<html><title>Peacock Not Found</title></html>"
			})
		).toBe(true);
	});

	it("rejects Peacock geo Unavailable page", () => {
		const seo =
			"https://www.peacocktv.com/watch-online/movies/sex-lies-and-the-college-cult/f45c2853-4230-3910-aa53-51ac37f5a788";
		expect(
			isMarketingShellHtml({
				service: "peacock",
				submittedUrl: seo,
				finalUrl: "https://www.peacocktv.com/unavailable",
				title: "Unavailable In Your Region",
				html: "<html><title>Unavailable In Your Region</title></html>"
			})
		).toBe(true);
	});

	it("accepts Peacock US SEO watch-online catalogue HTML", () => {
		const seo =
			"https://www.peacocktv.com/watch-online/movies/sex-lies-and-the-college-cult/f45c2853-4230-3910-aa53-51ac37f5a788";
		expect(
			isMarketingShellHtml({
				service: "peacock",
				submittedUrl: seo,
				finalUrl: seo,
				title: "Watch Sex, Lies and the College Cult | Peacock",
				html: `<html><head><meta property="og:title" content="Watch Sex, Lies and the College Cult | Peacock" /><title>Watch Sex, Lies and the College Cult | Peacock</title></head></html>`
			})
		).toBe(false);
	});
});
