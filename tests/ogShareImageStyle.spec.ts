import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	OG_SQUARE_FROM_WIDE_SCALE,
	OG_SQUARE_STYLE,
	OG_STYLE_COLORS,
	OG_STYLE_FACES,
	OG_WIDE_STYLE,
	ogTitleFontSize,
	ogTitlePadTop,
	scaleWidePx,
	squareArtMaxHeight,
	squareShowNameContentWidth,
	squareStackedMetaHeight,
	squareTwoLineShowNameHeight
} from "../src/ogShareImageStyle";
import { OG_SQUARE_TITLE_PX, OG_WIDE_TITLE_PX } from "../src/ogShareImageText";

const impl = readFileSync(resolve(process.cwd(), "src/ogShareImage.ts"), "utf8");
const styleMod = readFileSync(resolve(process.cwd(), "src/ogShareImageStyle.ts"), "utf8");
const styleDoc = readFileSync(resolve(process.cwd(), "docs/og-share-image-style-guide.md"), "utf8");

describe("OG style guide tokens", () => {
	it("documents wide as the source of truth and square as 800/1200", () => {
		expect(styleDoc).toContain("OG_WIDE_STYLE");
		expect(styleDoc).toContain("Instrument Serif");
		expect(styleDoc).toContain("Figtree");
		expect(styleDoc).toContain("72px");
		expect(styleDoc).toContain("88");
		expect(styleDoc).toContain("ogTitlePadTop");
		expect(styleDoc).toContain("800 / 1200");
		expect(OG_SQUARE_FROM_WIDE_SCALE).toBe(800 / 1200);
	});

	it("locks wide faces, colours, sizes, and margins", () => {
		expect(OG_STYLE_FACES.brand).toBe("Instrument Serif");
		expect(OG_STYLE_FACES.ui).toBe("Figtree");
		expect(OG_STYLE_FACES.titleWeight).toBe(600);
		expect(OG_STYLE_COLORS.ink).toBe("#0b0d12");
		expect(OG_STYLE_COLORS.amber).toBe("#f5c056");
		expect(OG_STYLE_COLORS.title).toBe("#ffffff");
		expect(OG_STYLE_COLORS.showName).toBe("#f0f2f5");
		expect(OG_STYLE_COLORS.meta).toBe("#e8ebf0");
		expect(OG_WIDE_STYLE.canvasWidth).toBe(1200);
		expect(OG_WIDE_STYLE.canvasHeight).toBe(630);
		expect(OG_WIDE_STYLE.brandLogo).toBe(88);
		expect(OG_WIDE_STYLE.brandSize).toBe(96);
		expect(OG_WIDE_STYLE.brandGap).toBe(16);
		expect(OG_WIDE_STYLE.titleSize).toBe(72);
		expect(OG_WIDE_STYLE.titleSize).toBe(OG_WIDE_TITLE_PX);
		expect(OG_WIDE_STYLE.titleLineHeight).toBe(1.1);
		expect(OG_WIDE_STYLE.titleMaxLines).toBe(5);
		expect(OG_WIDE_STYLE.podcastSize).toBe(48); // pragma: allowlist secret
		expect(OG_WIDE_STYLE.podcastSizeMin).toBe(32); // pragma: allowlist secret
		expect(OG_WIDE_STYLE.metaSize).toBe(28);
		expect(OG_WIDE_STYLE.icon).toBe(32);
		expect(OG_WIDE_STYLE.iconGap).toBe(10);
		expect(OG_WIDE_STYLE.artMaxWidth).toBe(700);
		expect(OG_WIDE_STYLE.artMaxHeight).toBe(440);
		expect(OG_WIDE_STYLE.artRadius).toBe(12);
		expect(OG_WIDE_STYLE.artPad).toBe(28);
		expect(OG_WIDE_STYLE.chromePadX).toBe(40);
		expect(OG_WIDE_STYLE.chromePadY).toBe(12);
		expect(OG_WIDE_STYLE.titleColumnPadLeftExtra).toBe(24);
		expect(OG_WIDE_STYLE.textPaddingX).toBe(36);
	});

	it("derives every square linear token from wide × 800/1200", () => {
		expect(OG_SQUARE_STYLE.canvasWidth).toBe(800);
		expect(OG_SQUARE_STYLE.canvasHeight).toBe(418);
		expect(OG_SQUARE_STYLE.titleSize).toBe(OG_SQUARE_TITLE_PX);
		expect(OG_SQUARE_STYLE.titleSize).toBe(scaleWidePx(OG_WIDE_STYLE.titleSize));
		expect(OG_SQUARE_STYLE.brandLogo).toBe(scaleWidePx(OG_WIDE_STYLE.brandLogo));
		expect(OG_SQUARE_STYLE.brandSize).toBe(scaleWidePx(OG_WIDE_STYLE.brandSize));
		expect(OG_SQUARE_STYLE.brandGap).toBe(scaleWidePx(OG_WIDE_STYLE.brandGap));
		expect(OG_SQUARE_STYLE.icon).toBe(scaleWidePx(OG_WIDE_STYLE.icon));
		expect(OG_SQUARE_STYLE.iconGap).toBe(scaleWidePx(OG_WIDE_STYLE.iconGap));
		expect(OG_SQUARE_STYLE.artMaxWidth).toBe(scaleWidePx(OG_WIDE_STYLE.artMaxWidth));
		expect(OG_SQUARE_STYLE.artMaxHeight).toBe(scaleWidePx(OG_WIDE_STYLE.artMaxHeight));
		expect(squareArtMaxHeight()).toBeLessThan(OG_SQUARE_STYLE.artMaxHeight);
		expect(OG_SQUARE_STYLE.artRadius).toBe(scaleWidePx(OG_WIDE_STYLE.artRadius));
		expect(OG_SQUARE_STYLE.artPad).toBe(scaleWidePx(OG_WIDE_STYLE.artPad));
		expect(OG_SQUARE_STYLE.metaSize).toBe(scaleWidePx(OG_WIDE_STYLE.metaSize));
		expect(OG_SQUARE_STYLE.podcastSize).toBe(scaleWidePx(OG_WIDE_STYLE.podcastSize)); // pragma: allowlist secret
		expect(OG_SQUARE_STYLE.podcastSizeMin).toBe(scaleWidePx(OG_WIDE_STYLE.podcastSizeMin)); // pragma: allowlist secret
		expect(OG_SQUARE_STYLE.chromePadX).toBe(scaleWidePx(OG_WIDE_STYLE.chromePadX));
		expect(OG_SQUARE_STYLE.chromePadY).toBe(scaleWidePx(OG_WIDE_STYLE.chromePadY));
		expect(OG_SQUARE_STYLE.titleMaxLines).toBe(OG_WIDE_STYLE.titleMaxLines);
		expect(OG_SQUARE_STYLE.titleLineHeight).toBe(OG_WIDE_STYLE.titleLineHeight);
	});

	it("uses one title size per canvas and centres the title on the art", () => {
		expect(ogTitleFontSize("wide")).toBe(72);
		expect(ogTitleFontSize("square")).toBe(48); // pragma: allowlist secret
		const lineBox = Math.ceil(72 * 1.1);
		expect(ogTitlePadTop(440, lineBox, 2)).toBe(Math.floor((440 - lineBox * 2) / 2));
		expect(ogTitlePadTop(100, 80, 2)).toBe(0);
	});
});

describe("OG implementation meets the style guide", () => {
	it("wires the renderer to the style-guide module", () => {
		expect(impl).toContain('from "./ogShareImageStyle"');
		expect(impl).toContain("OG_WIDE_STYLE");
		expect(impl).toContain("OG_SQUARE_STYLE");
		expect(impl).toContain("OG_STYLE_FACES");
		expect(impl).toContain("OG_STYLE_COLORS");
		expect(impl).toContain("ogTitleFontSize");
		expect(impl).toContain("ogTitlePadTop");
		expect(styleMod).toContain("export const OG_WIDE_STYLE");
	});

	it("paints titles in Figtree 600 only (no Instrument Serif fallback)", () => {
		const titleFn = impl.match(/function titleBlockHtml\([\s\S]*?\n\}/)?.[0];
		expect(titleFn).toBeDefined();
		expect(titleFn).toContain("OG_STYLE_FACES.ui");
		expect(titleFn).toContain("OG_STYLE_FACES.titleWeight");
		expect(titleFn).not.toContain("Instrument Serif");
	});

	it("uses Instrument Serif only on the brand wordmark", () => {
		expect(impl).toContain("OG_STYLE_FACES.brand");
		const titleFn = impl.match(/function titleBlockHtml\([\s\S]*?\n\}/)?.[0] ?? "";
		expect(impl.replace(titleFn, "")).toContain("OG_STYLE_FACES.brand");
	});

	it("registers Figtree before Instrument Serif", () => {
		const fonts = impl.match(/fonts:\s*\[[\s\S]*?\]/)?.[0];
		expect(fonts).toBeDefined();
		expect(fonts?.indexOf("Figtree")).toBeLessThan(fonts?.indexOf("Instrument Serif") ?? -1);
	});

	it("cannot fit two square show-name rows under 1:1 art, so the name is one line and wider", () => {
		expect(squareTwoLineShowNameHeight()).toBeGreaterThan(squareStackedMetaHeight());
		expect(squareShowNameContentWidth()).toBeGreaterThan(squareArtMaxHeight());
		expect(impl).toContain("squareShowNameContentWidth");
		expect(impl).toContain("align-items:flex-end");
		expect(impl).toContain("justify-content:space-between");
		expect(impl).toContain("squareArtMaxHeight");
	});

	it("applies the same columns chrome and title pad on square as on wide", () => {
		expect(impl).toContain("ogTitlePadTop(input.artHeight, titleLineBox, titleLayout.lines.length)");
		expect(impl.split("ogTitlePadTop(").length).toBeGreaterThanOrEqual(3);
		expect(impl).toContain("CARD_SCALE.square");
		expect(impl).toContain("height:${input.artHeight}px");
		expect(impl).toContain("justify-content:center");
		expect(impl).not.toContain("Square cards keep a compact right stack");
	});

	it("keeps wide canvas and art box at the documented sizes", () => {
		expect(impl).toContain("OG_WIDE_STYLE.canvasWidth");
		expect(impl).toContain("OG_WIDE_STYLE.artMaxWidth");
		expect(impl).toContain("OG_WIDE_STYLE.artMaxHeight");
		expect(impl).toContain("OG_WIDE_STYLE.brandLogo");
		expect(impl).toContain("OG_WIDE_STYLE.titleMaxLines");
	});
});
