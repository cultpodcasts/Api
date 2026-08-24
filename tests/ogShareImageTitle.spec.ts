import { describe, expect, it } from "vitest";
import {
	fitOgWrappedText,
	longestTokenLength,
	ogTitleCharBudget,
	truncateOgText
} from "../src/ogShareImageText";

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

describe("fitOgWrappedText", () => {
	it("keeps short copy at the largest size", () => {
		const fit = fitOgWrappedText({
			text: "Sample Show Name",
			columnWidth: 700,
			sizes: [48, 40, 32],
			maxLines: 2
		});
		expect(fit.fontSize).toBe(48);
		expect(fit.text).toBe("Sample Show Name");
	});

	it("shrinks type before truncating so two lines can hold more", () => {
		const long = "Weekly Briefing on Borough Politics";
		const large = ogTitleCharBudget({ columnWidth: 360, fontSize: 48, maxLines: 2 });
		const small = ogTitleCharBudget({ columnWidth: 360, fontSize: 32, maxLines: 2 });
		expect(long.length).toBeGreaterThan(large);
		expect(long.length).toBeLessThanOrEqual(small);
		const fit = fitOgWrappedText({
			text: long,
			columnWidth: 360,
			sizes: [48, 40, 32],
			maxLines: 2
		});
		expect(fit.fontSize).toBeLessThan(48);
		expect(fit.text).toBe(long);
		expect(fit.text.endsWith("…")).toBe(false);
	});

	it("truncates only after the smallest two-line size still overflows", () => {
		const long =
			"Why the fringe keeps winning elections in every obscure borough across the map this decade and what that means tonight";
		const fit = fitOgWrappedText({
			text: long,
			columnWidth: 360,
			sizes: [48, 40, 32],
			maxLines: 2
		});
		expect(fit.fontSize).toBe(32);
		expect(fit.text.endsWith("…")).toBe(true);
		expect(fit.text.length).toBeLessThan(long.length);
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
