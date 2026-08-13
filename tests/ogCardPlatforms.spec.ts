import { describe, expect, it } from "vitest";
import {
	inferOgPlatforms,
	parseOgPlatforms,
	platformIconDataUrl,
	serializeOgPlatforms
} from "../src/ogCardPlatforms";

describe("ogCardPlatforms", () => {
	it("parses and orders platform chips", () => {
		expect(parseOgPlatforms("apple,youtube,spotify")).toEqual([
			"youtube",
			"spotify",
			"apple"
		]);
		expect(serializeOgPlatforms(["bbc", "youtube"])).toBe("youtube,bbc");
	});

	it("infers platforms from search-shaped fields", () => {
		expect(
			inferOgPlatforms({
				youtubeId: "abc",
				spotify: "https://open.spotify.com/episode/1",
				apple: null,
				bbc: "https://www.bbc.co.uk/sounds/play/1"
			})
		).toEqual(["youtube", "spotify", "bbc"]);
	});

	it("exposes icon data URLs without listen/watch labels", () => {
		const yt = platformIconDataUrl("youtube");
		expect(yt.startsWith("data:image/svg+xml;base64,")).toBe(true);
		expect(yt.toLowerCase()).not.toContain("listen");
		expect(yt.toLowerCase()).not.toContain("watch");
	});

	it("uses the website Apple Podcasts mark (purple gradient + person/arcs)", () => {
		const apple = atob(platformIconDataUrl("apple").replace("data:image/svg+xml;base64,", ""));
		expect(apple).toContain("#822CBE");
		expect(apple).toContain("#D772FB");
		expect(apple).toContain('rx="24"');
		expect(apple).toContain("M23.788 8.68908");
		expect(apple).toContain("M23.9987 25.5179");
	});

	it("uses website Spotify / YouTube / BBC asset colours in equal square footprints", () => {
		const spotify = atob(platformIconDataUrl("spotify").replace("data:image/svg+xml;base64,", ""));
		const youtube = atob(platformIconDataUrl("youtube").replace("data:image/svg+xml;base64,", ""));
		const bbc = atob(platformIconDataUrl("bbc").replace("data:image/svg+xml;base64,", ""));
		expect(spotify).toContain("#8BC34A");
		expect(spotify).toContain("#37474F");
		expect(youtube).toContain("#F44336");
		expect(youtube).toContain('viewBox="0 0 24 24"');
		expect(youtube).toContain('rx="5.4"');
		expect(bbc).toContain("#FA6400");
		expect(bbc).toContain("#A13104");
		expect(bbc).toContain('viewBox="0 0 24 24"');
	});
});
