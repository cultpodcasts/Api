import { describe, expect, it } from "vitest";
import { fitArtWithin, readImageSize } from "../src/ogArtSize";

describe("fitArtWithin", () => {
	it("keeps 16:9 inside a wide max box", () => {
		expect(fitArtWithin(1280, 720, 680, 574)).toEqual({ width: 680, height: 383 });
	});

	it("keeps 4:3 YouTube hqdefault without cropping", () => {
		expect(fitArtWithin(480, 360, 680, 574)).toEqual({ width: 680, height: 510 });
	});

	it("keeps 1:1 album art inside a square max box", () => {
		expect(fitArtWithin(640, 640, 360, 378)).toEqual({ width: 360, height: 360 });
	});
});

describe("readImageSize", () => {
	it("reads PNG IHDR dimensions", () => {
		// Minimal 1×1 PNG
		const b64 =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
		const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
		expect(readImageSize(bytes)).toEqual({ width: 1, height: 1 });
	});

	it("returns null for non-image bytes", () => {
		expect(readImageSize(new TextEncoder().encode("not-an-image").buffer)).toBeNull();
	});
});
