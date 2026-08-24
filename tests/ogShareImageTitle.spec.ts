import { describe, expect, it } from "vitest";
import {
	countOgWrappedLines,
	fitOgWrappedText,
	layoutOgTitle,
	longestTokenLength,
	OG_TITLE_ELLIPSIS,
	OG_TITLE_HYPHEN,
	OG_SQUARE_TITLE_PX,
	OG_WIDE_TITLE_PX,
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

describe("countOgWrappedLines", () => {
	it("counts a two-word wrap in the wide title column", () => {
		expect(
			countOgWrappedLines({
				text: "Cult Soul Mates",
				columnWidth: 364,
				fontSize: 72,
				maxLines: 5
			})
		).toBe(2);
	});

	it("keeps a short single token on one line", () => {
		expect(
			countOgWrappedLines({
				text: "Mates",
				columnWidth: 364,
				fontSize: 72,
				maxLines: 5
			})
		).toBe(1);
	});

	it("counts hyphenated lines for a token wider than the column", () => {
		expect(
			countOgWrappedLines({
				text: "Boroughboundaryreconsideration",
				columnWidth: 364,
				fontSize: OG_WIDE_TITLE_PX,
				maxLines: 5
			})
		).toBeGreaterThanOrEqual(2);
	});
});

describe("layoutOgTitle", () => {
	it("hyphenates a token that does not fit the column", () => {
		const { lines } = layoutOgTitle({
			text: "Boroughboundaryreconsideration",
			columnWidth: 364,
			fontSize: OG_WIDE_TITLE_PX,
			maxLines: 5
		});
		expect(lines.length).toBeGreaterThanOrEqual(2);
		expect(lines.length).toBeLessThanOrEqual(4);
		expect(lines.slice(0, -1).every((line) => line.endsWith(OG_TITLE_HYPHEN))).toBe(true);
		expect(lines[lines.length - 1].endsWith(OG_TITLE_HYPHEN)).toBe(false);
		expect(lines[0].replaceAll(OG_TITLE_HYPHEN, "").length).toBeGreaterThanOrEqual(8);
		expect(lines.join("").replaceAll(OG_TITLE_HYPHEN, "")).toBe(
			"Boroughboundaryreconsideration"
		);
	});

	it("ellipsizes when hyphenation would exceed maxLines", () => {
		const { lines } = layoutOgTitle({
			text: "Briefly Briefly Briefly Briefly UncharacteristicallyLong",
			columnWidth: 364,
			fontSize: OG_WIDE_TITLE_PX,
			maxLines: 5
		});
		expect(lines.length).toBe(5);
		expect(lines[lines.length - 1].endsWith(OG_TITLE_ELLIPSIS)).toBe(true);
	});

	it("uses the same wide title size for a long word and a long sentence", () => {
		expect(OG_WIDE_TITLE_PX).toBe(72);
		expect(OG_SQUARE_TITLE_PX).toBe(48);
		expect(OG_SQUARE_TITLE_PX).toBe(Math.round((OG_WIDE_TITLE_PX * 800) / 1200));
		const longWord = layoutOgTitle({
			text: "Boroughboundaryreconsideration",
			columnWidth: 364,
			fontSize: OG_WIDE_TITLE_PX,
			maxLines: 5
		});
		const longSentence = layoutOgTitle({
			text: "Weekly briefing on why the fringe keeps winning every obscure borough race tonight after midnight",
			columnWidth: 364,
			fontSize: OG_WIDE_TITLE_PX,
			maxLines: 5
		});
		expect(longWord.lines.length).toBeGreaterThan(1);
		expect(longSentence.lines.length).toBeGreaterThan(1);
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
