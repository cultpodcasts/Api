import { describe, expect, it } from "vitest";
import { playableCardTitle, playableLookupFilters } from "../src/playableSearchFields";

describe("playable search fields", () => {
	it("tries seriesName before podcastName and escapes quotes", () => {
		const [next, legacy] = playableLookupFilters("O'Hara", "abc");
		expect(next).toBe("(seriesName eq 'O''Hara') and (id eq 'abc')");
		expect(legacy).toBe("(podcastName eq 'O''Hara') and (id eq 'abc')");
	});

	it("prefers title and falls back to episodeTitle", () => {
		expect(playableCardTitle({ title: "New", episodeTitle: "Old" })).toBe("New");
		expect(playableCardTitle({ episodeTitle: "Old" })).toBe("Old");
		expect(playableCardTitle({})).toBe("");
	});
});
