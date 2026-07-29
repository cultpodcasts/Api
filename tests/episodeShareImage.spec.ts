import { describe, expect, it } from "vitest";
import {
	expandSearchImage,
	resolveEpisodeShareImage,
	shareImageFromStorage,
	toShareImageStorage
} from "../src/episodeShareImage";

describe("expandSearchImage (search-index encoding)", () => {
	it("expands Spotify / Apple / YouTube tokens", () => {
		expect(expandSearchImage("sab6765ferngully00cover", undefined))
			.toBe("https://i.scdn.co/image/ab6765ferngully00cover");
		expect(expandSearchImage("a3Music/draymoor/600x600bb.jpg", undefined))
			.toBe("https://is3-ssl.mzstatic.com/image/thumb/Music/draymoor/600x600bb.jpg");
		expect(expandSearchImage("yx", "griffinsong42"))
			.toBe("https://i.ytimg.com/vi/griffinsong42/maxresdefault.jpg");
	});

	it("passes through absolute URLs unchanged", () => {
		expect(expandSearchImage("https://feeds.example/art.jpg", undefined))
			.toBe("https://feeds.example/art.jpg");
	});
});

describe("resolveEpisodeShareImage", () => {
	it("expands Spotify cover tokens to absolute square art", () => {
		const share = resolveEpisodeShareImage({ image: "sab6765ferngully00cover" });
		expect(share).toEqual({
			image: "https://i.scdn.co/image/ab6765ferngully00cover",
			imageAspect: "square"
		});
	});

	it("expands Apple cover tokens to absolute square art", () => {
		const share = resolveEpisodeShareImage({ image: "a3Music/draymoor/600x600bb.jpg" });
		expect(share).toEqual({
			image: "https://is3-ssl.mzstatic.com/image/thumb/Music/draymoor/600x600bb.jpg",
			imageAspect: "square"
		});
	});

	it("prefers YouTube hqdefault when youtubeId is set (wide card)", () => {
		const share = resolveEpisodeShareImage({
			image: "sab6765cover",
			youtubeId: "griffinsong42"
		});
		expect(share).toEqual({
			image: "https://i.ytimg.com/vi/griffinsong42/hqdefault.jpg",
			imageAspect: "wide"
		});
	});

	it("expands compacted YouTube quality tokens with youtubeId", () => {
		const share = resolveEpisodeShareImage({ image: "yh", youtubeId: "griffinsong42" });
		expect(share).toEqual({
			image: "https://i.ytimg.com/vi/griffinsong42/hqdefault.jpg",
			imageAspect: "wide"
		});
	});

	it("passes through absolute YouTube URLs as wide", () => {
		const share = resolveEpisodeShareImage({
			image: "https://i.ytimg.com/vi/abc/hqdefault.jpg"
		});
		expect(share?.imageAspect).toBe("wide");
		expect(share?.image).toContain("i.ytimg.com");
	});

	it("returns undefined when nothing is resolvable", () => {
		expect(resolveEpisodeShareImage({})).toBeUndefined();
		expect(resolveEpisodeShareImage({ image: "yx" })).toBeUndefined();
	});

	it("treats BBC iPlayer episodes as wide even with square cover art", () => {
		const share = resolveEpisodeShareImage({
			image: "sab6765cover",
			bbc: "https://www.bbc.co.uk/iplayer/episode/p0example"
		});
		expect(share).toEqual({
			image: "https://i.scdn.co/image/ab6765cover",
			imageAspect: "wide"
		});
	});

	it("treats BBC Sounds episodes as square", () => {
		const share = resolveEpisodeShareImage({
			image: "sab6765cover",
			bbc: "https://www.bbc.co.uk/sounds/play/p0example"
		});
		expect(share).toEqual({
			image: "https://i.scdn.co/image/ab6765cover",
			imageAspect: "square"
		});
	});

	it("treats Internet Archive episodes as wide even with square cover art", () => {
		const share = resolveEpisodeShareImage({
			image: "a3Music/draymoor/600x600bb.jpg",
			internetArchive: "https://archive.org/details/example"
		});
		expect(share).toEqual({
			image: "https://is3-ssl.mzstatic.com/image/thumb/Music/draymoor/600x600bb.jpg",
			imageAspect: "wide"
		});
	});
});

describe("toShareImageStorage / shareImageFromStorage", () => {
	it("stores search-index tokens and expands them back for page-details", () => {
		const stored = toShareImageStorage({
			image: "yx",
			youtubeId: "griffinsong42"
		});
		expect(stored).toEqual({
			image: "yx",
			youtubeId: "griffinsong42",
			imageAspect: "wide"
		});
		expect(shareImageFromStorage(stored!)).toEqual({
			image: "https://i.ytimg.com/vi/griffinsong42/maxresdefault.jpg",
			imageAspect: "wide"
		});
	});

	it("stores Spotify tokens as-is for square episodes", () => {
		const stored = toShareImageStorage({ image: "sab6765cover" });
		expect(stored?.image).toBe("sab6765cover");
		expect(shareImageFromStorage(stored!)?.image)
			.toBe("https://i.scdn.co/image/ab6765cover");
	});

	it("stores absolute YouTube URL when index image is Spotify but youtubeId forces a frame", () => {
		// Display prefers YT; search image stays Spotify — storage keeps the search token,
		// expand path uses youtubeId → hqdefault for the absolute share URL.
		const stored = toShareImageStorage({
			image: "sab6765cover",
			youtubeId: "griffinsong42"
		});
		expect(stored).toEqual({
			image: "sab6765cover",
			youtubeId: "griffinsong42",
			imageAspect: "wide"
		});
		expect(shareImageFromStorage(stored!)?.image)
			.toBe("https://i.ytimg.com/vi/griffinsong42/hqdefault.jpg");
	});
});
