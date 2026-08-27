import { describe, expect, it } from "vitest";
import { expandSearchServices } from "../src/searchServices";

describe("searchServices", () => {
	it("expands compact svc tokens for BBC Sounds and Vimeo", () => {
		expect(expandSearchServices("bbcSounds:p0example|vimeo:123456789")).toEqual([
			{ key: "bbcSounds", url: "https://www.bbc.co.uk/sounds/play/p0example" },
			{ key: "vimeo", url: "https://vimeo.com/123456789" }
		]);
	});

	it("expands a u-prefixed full Netflix URL", () => {
		const svc = "netflix:uhttps://www.netflix.com/watch/81040344?trackId=1";
		expect(expandSearchServices(svc)).toEqual([
			{ key: "netflix", url: "https://www.netflix.com/watch/81040344?trackId=1" }
		]);
	});
});
