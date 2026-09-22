import { describe, expect, it } from "vitest";
import { isMarketingShellHtml } from "../src/marketingShellReject";

describe("isMarketingShellHtml", () => {
	const huluUrl =
		"https://www.hulu.com/series/heavens-gate-the-cult-of-cults-3de513f8-ee47-44d4-98c8-f6910ce4ee9b";

	it("rejects Hulu → Disney+ marketing title", () => {
		expect(
			isMarketingShellHtml({
				service: "hulu",
				submittedUrl: huluUrl,
				finalUrl: "https://www.disneyplus.com/",
				title: "Disney+ | Stream Movies, TV Shows, and Originals",
				html: "<html><title>Disney+</title></html>"
			})
		).toBe(true);
	});

	it("rejects Hulu when finalUrl leaves hulu.com", () => {
		expect(
			isMarketingShellHtml({
				service: "hulu",
				submittedUrl: huluUrl,
				finalUrl: "https://www.disneyplus.com/en-gb",
				title: "Watch Heaven's Gate",
				html: "<html><title>Watch Heaven's Gate</title></html>"
			})
		).toBe(true);
	});

	it("rejects Disney+ United Kingdom soft-wall title from Hulu", () => {
		expect(
			isMarketingShellHtml({
				service: "hulu",
				submittedUrl: huluUrl,
				finalUrl: "https://www.disneyplus.com/en-gb",
				title: "Watch new Originals, blockbusters and series - Disney+ United Kingdom",
				html: "<html><title>Watch new Originals, blockbusters and series - Disney+ United Kingdom</title></html>"
			})
		).toBe(true);
	});

	it("accepts real Hulu catalogue HTML", () => {
		expect(
			isMarketingShellHtml({
				service: "hulu",
				submittedUrl: huluUrl,
				finalUrl: huluUrl,
				title: "Watch Heaven's Gate: The Cult of Cults Streaming Online | Hulu",
				html: `<html><head><meta property="og:title" content="Heaven's Gate: The Cult of Cults" /><title>Watch Heaven's Gate: The Cult of Cults Streaming Online | Hulu</title></head></html>`
			})
		).toBe(false);
	});

	it("ignores non-Hulu/Peacock/Disney+ services", () => {
		expect(
			isMarketingShellHtml({
				service: "itvx",
				submittedUrl: "https://www.itv.com/watch/x",
				finalUrl: "https://www.disneyplus.com/",
				title: "Disney+",
				html: "<title>Disney+</title>"
			})
		).toBe(false);
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
});
