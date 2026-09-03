import { describe, expect, it } from "vitest";
import {
	OG_SQUARE_FROM_WIDE_SCALE,
	OG_SQUARE_STYLE,
	OG_STYLE_COLORS,
	OG_STYLE_FACES,
	OG_WIDE_STYLE,
	ogTitleFontSize,
	ogTitlePadTop,
	scaleWidePx,
	OG_SQUARE_FOOTER_GUTTER,
	squareArtMaxHeight,
	squareCanvasHeight,
	squareShowNameContentWidth,
	squareStackedMetaHeight,
	squareStackedMetaWidth,
	squareTwoLineShowNameHeight
} from "../src/ogShareImageStyle";
import { OG_SQUARE_TITLE_PX, OG_WIDE_TITLE_PX } from "../src/ogShareImageText";

describe("OG style guide tokens", () => {
	it("treats wide as the source of truth and square as 800/1200", () => {
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
		expect(OG_SQUARE_STYLE.titleSize).toBe(OG_SQUARE_TITLE_PX);
		expect(OG_SQUARE_STYLE.titleSize).toBe(scaleWidePx(OG_WIDE_STYLE.titleSize));
		expect(OG_SQUARE_STYLE.brandLogo).toBe(scaleWidePx(OG_WIDE_STYLE.brandLogo));
		expect(OG_SQUARE_STYLE.brandSize).toBe(scaleWidePx(OG_WIDE_STYLE.brandSize));
		expect(OG_SQUARE_STYLE.brandGap).toBe(scaleWidePx(OG_WIDE_STYLE.brandGap));
		expect(OG_SQUARE_STYLE.icon).toBe(scaleWidePx(OG_WIDE_STYLE.icon));
		expect(OG_SQUARE_STYLE.iconGap).toBe(scaleWidePx(OG_WIDE_STYLE.iconGap));
		expect(OG_SQUARE_STYLE.artMaxWidth).toBe(OG_WIDE_STYLE.artMaxHeight);
		expect(OG_SQUARE_STYLE.artMaxHeight).toBe(OG_WIDE_STYLE.artMaxHeight);
		expect(squareArtMaxHeight()).toBe(OG_WIDE_STYLE.artMaxHeight);
		expect(squareArtMaxHeight()).toBe(440);
		expect(squareCanvasHeight()).toBeGreaterThan(OG_WIDE_STYLE.artMaxHeight);
		expect(OG_SQUARE_STYLE.artRadius).toBe(scaleWidePx(OG_WIDE_STYLE.artRadius));
		expect(OG_SQUARE_STYLE.artPad).toBe(scaleWidePx(OG_WIDE_STYLE.artPad));
		expect(OG_SQUARE_STYLE.metaSize).toBe(scaleWidePx(OG_WIDE_STYLE.metaSize));
		expect(OG_SQUARE_STYLE.podcastSize).toBe(OG_WIDE_STYLE.podcastSize); // pragma: allowlist secret
		expect(OG_SQUARE_STYLE.podcastSizeMin).toBe(OG_WIDE_STYLE.podcastSizeMin); // pragma: allowlist secret
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

	it("keeps square show name and stacked meta in separate footer columns", () => {
		expect(OG_SQUARE_STYLE.podcastSize).toBe(48); // pragma: allowlist secret
		expect(OG_SQUARE_STYLE.podcastMaxLines).toBe(OG_WIDE_STYLE.podcastMaxLines); // pragma: allowlist secret
		expect(OG_SQUARE_STYLE.podcastMaxLines).toBe(2); // pragma: allowlist secret
		expect(squareTwoLineShowNameHeight()).toBeGreaterThan(squareStackedMetaHeight());
		expect(squareShowNameContentWidth()).toBeGreaterThan(squareArtMaxHeight());
		const used =
			OG_SQUARE_STYLE.artPad +
			squareShowNameContentWidth() +
			OG_SQUARE_FOOTER_GUTTER +
			squareStackedMetaWidth() +
			OG_SQUARE_STYLE.chromePadX;
		expect(used).toBeLessThanOrEqual(OG_SQUARE_STYLE.canvasWidth);
		expect(OG_SQUARE_FOOTER_GUTTER).toBeGreaterThanOrEqual(24);
	});
});
