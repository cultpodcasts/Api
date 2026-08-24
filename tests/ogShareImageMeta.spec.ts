import { describe, expect, it } from "vitest";
import { formatOgDuration, formatOgReleaseDate } from "../src/ogShareImageMeta";

describe("formatOgReleaseDate", () => {
	it("formats ISO dates as day month year", () => {
		expect(formatOgReleaseDate("2026-08-24")).toBe("24 Aug 2026");
		expect(formatOgReleaseDate("2026-08-24T09:00:00Z")).toBe("24 Aug 2026");
	});

	it("formats UK dd/mm/yyyy dates", () => {
		expect(formatOgReleaseDate("24/08/2026")).toBe("24 Aug 2026");
		expect(formatOgReleaseDate("7/1/2026")).toBe("7 Jan 2026");
	});

	it("leaves already-localised dates unchanged", () => {
		expect(formatOgReleaseDate("24 Aug 2026")).toBe("24 Aug 2026");
	});
});

describe("formatOgDuration", () => {
	it("renders sub-hour TimeSpans as minutes only", () => {
		expect(formatOgDuration("00:51:28")).toBe("51 min");
		expect(formatOgDuration("00:51:28.0000000")).toBe("51 min");
	});

	it("renders hour-plus runtimes as hours and minutes", () => {
		expect(formatOgDuration("01:05:00")).toBe("1h 5m");
		expect(formatOgDuration("01:00:00")).toBe("1h");
		expect(formatOgDuration("02:30:20")).toBe("2h 30m");
	});

	it("leaves already-compact durations unchanged", () => {
		expect(formatOgDuration("51 min")).toBe("51 min");
		expect(formatOgDuration("1h 24m")).toBe("1h 24m");
	});
});
