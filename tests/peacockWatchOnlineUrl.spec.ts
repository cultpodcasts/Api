import { describe, expect, it } from "vitest";
import {
	isPeacockWatchOnlineUrl,
	peacockPrepareFetchUrl,
	toPeacockWatchOnlineUrl
} from "../src/peacockWatchOnlineUrl";

describe("peacockWatchOnlineUrl", () => {
	const movieSeo =
		"https://www.peacocktv.com/watch-online/movies/sex-lies-and-the-college-cult/f45c2853-4230-3910-aa53-51ac37f5a788";
	const episodeSeo =
		"https://www.peacocktv.com/watch-online/tv/the-office-uk/8893980556248533112/seasons/1/episodes/work-experience-episode-2/9694b7a9-ffae-3b84-9606-5f852ccffee0";

	it("detects public SEO watch-online URLs", () => {
		expect(isPeacockWatchOnlineUrl(movieSeo)).toBe(true);
		expect(isPeacockWatchOnlineUrl(episodeSeo)).toBe(true);
		expect(
			isPeacockWatchOnlineUrl(
				"https://www.peacocktv.com/watch/asset/tv/the-office/5568795438602876112"
			)
		).toBe(false);
	});

	it("rewrites asset TV episode path to watch-online", () => {
		const asset =
			"https://www.peacocktv.com/watch/asset/tv/the-office-uk/8893980556248533112/seasons/1/episodes/work-experience-episode-2/9694b7a9-ffae-3b84-9606-5f852ccffee0";
		expect(toPeacockWatchOnlineUrl(asset)).toBe(episodeSeo);
		expect(peacockPrepareFetchUrl(asset)).toBe(episodeSeo);
	});

	it("rewrites asset movie path to watch-online", () => {
		const asset =
			"https://www.peacocktv.com/watch/asset/movies/sex-lies-and-the-college-cult/f45c2853-4230-3910-aa53-51ac37f5a788";
		expect(toPeacockWatchOnlineUrl(asset)).toBe(movieSeo);
	});

	it("maps singular movie kind to movies on rewrite", () => {
		const asset =
			"https://www.peacocktv.com/watch/asset/movie/sex-lies-and-the-college-cult/f45c2853-4230-3910-aa53-51ac37f5a788";
		expect(toPeacockWatchOnlineUrl(asset)).toBe(movieSeo);
	});

	it("does not rewrite when already watch-online", () => {
		expect(toPeacockWatchOnlineUrl(movieSeo)).toBeNull();
		expect(peacockPrepareFetchUrl(movieSeo)).toBe(movieSeo);
	});

	it("does not rewrite playback or app shells", () => {
		expect(
			toPeacockWatchOnlineUrl(
				"https://www.peacocktv.com/watch/playback/vod/GMO_00000000391471_01/8e388082-094f-3974-951b-03332f1a1e67"
			)
		).toBeNull();
		expect(toPeacockWatchOnlineUrl("https://www.peacocktv.com/watch/home")).toBeNull();
	});
});
