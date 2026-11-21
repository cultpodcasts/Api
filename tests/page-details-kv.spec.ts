import { describe, expect, it } from "vitest";
import { pageDetailsFromKv } from "../src/getPageDetails";
import type { ShortnerRecord } from "../src/ShortnerRecord";

const requestUrl = "https://api.cultpodcasts.com/pagedetails/Synthetic%20Podcast/episode-id";

function kvRecord(): ShortnerRecord {
	return {
		episodeTitle: "Synthetic episode",
		releaseDate: "21/11/2026",
		duration: "00:42:00",
		image: "ys",
		youtubeId: "syntheticVid1",
		imageAspect: "wide"
	};
}

describe("pageDetailsFromKv curator-removed image (RPP #1500)", () => {
	it("returns no share image when the KV record has stored art but the live search image is '-'", () => {
		const details = pageDetailsFromKv("Synthetic Podcast", kvRecord(), requestUrl, {
			image: "-",
			youtubeId: "syntheticVid1"
		});

		expect(details.image).toBeUndefined();
		expect(details.imageAspect).toBeUndefined();
		expect(details.title).toBe("Synthetic episode | Synthetic Podcast");
	});

	it("keeps the stored KV share image when the live search image is not removed", () => {
		const withLive = pageDetailsFromKv("Synthetic Podcast", kvRecord(), requestUrl, {
			image: "yh",
			youtubeId: "syntheticVid1"
		});
		const withoutLive = pageDetailsFromKv("Synthetic Podcast", kvRecord(), requestUrl);

		expect(withLive.image).toBeDefined();
		expect(withLive.image).toContain("/og-image");
		expect(decodeURIComponent(withLive.image ?? "")).toContain("https://i.ytimg.com/vi/syntheticVid1/sddefault.jpg");
		expect(withLive.imageAspect).toBe("wide");
		expect(withLive.image).toBe(withoutLive.image);
	});
});
