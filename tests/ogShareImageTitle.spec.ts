import { describe, expect, it } from "vitest";
import { longestTokenLength, ogTitleCharBudget, truncateOgText } from "../src/ogShareImageText";

describe("longestTokenLength", () => {
	it("returns 0 for blank input", () => {
		expect(longestTokenLength("")).toBe(0);
		expect(longestTokenLength("   ")).toBe(0);
	});

	it("measures the longest whitespace-separated token", () => {
		expect(longestTokenLength("short words only")).toBe(5);
		expect(
			longestTokenLength("The Supercalifragilisticexpialidocious conspiracy")
		).toBe("Supercalifragilisticexpialidocious".length);
	});
});

describe("ogTitleCharBudget", () => {
	it("fits roughly maxLines of glyphs in the column", () => {
		// Wide card, max-width art (~428px column), titleSmall 38px, 4 lines.
		const budget = ogTitleCharBudget({
			columnWidth: 428,
			fontSize: 38,
			maxLines: 4
		});
		expect(budget).toBeGreaterThanOrEqual(60);
		expect(budget).toBeLessThanOrEqual(100);
	});
});

describe("truncateOgText", () => {
	it("leaves short text unchanged", () => {
		expect(truncateOgText("Hello world", 100)).toBe("Hello world");
	});

	it("truncates on a word boundary with an ellipsis", () => {
		const long =
			"Why the fringe keeps winning elections in every obscure borough across the map this decade and beyond";
		const out = truncateOgText(long, 40);
		expect(out.endsWith("…")).toBe(true);
		expect(out.length).toBeLessThanOrEqual(40);
		const kept = out.slice(0, -1);
		expect(long.startsWith(kept)).toBe(true);
		expect(long[kept.length]).toBe(" ");
	});
});
