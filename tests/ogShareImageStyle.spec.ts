import { describe, expect, it } from "vitest";
import { fitArtWithin } from "../src/ogArtSize";
import {
	OG_LARGE_CARD_ASPECT,
	OG_SQUARE_ART_MAX,
	OG_SQUARE_ART_MAX_WIDTH,
	OG_SQUARE_STYLE,
	OG_STYLE_COLORS,
	OG_STYLE_FACES,
	OG_WIDE_STYLE,
	ogCardArtMaxBox,
	ogCardCanvasSize,
	ogTitleFontSize,
	ogTitlePadTop,
	squareBrandBarHeight,
	squareFooterHeight,
	OG_SQUARE_FOOTER_GUTTER,
	squareArtMaxHeight,
	squareCanvasHeight,
	squareShowNameContentWidth,
	squareStackedMetaHeight,
	squareStackedMetaWidth,
	squareTitleContentWidth,
	squareTwoLineShowNameHeight
} from "../src/ogShareImageStyle";
import { OG_SQUARE_TITLE_PX, OG_WIDE_TITLE_PX } from "../src/ogShareImageText";

describe("OG style guide tokens", () => {
	it("treats wide as the source of truth for the 1200×630 large-card aspect", () => {
		expect(OG_LARGE_CARD_ASPECT).toBeCloseTo(1.905, 3);
		expect(OG_WIDE_STYLE.canvasWidth / OG_WIDE_STYLE.canvasHeight).toBe(OG_LARGE_CARD_ASPECT);
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

	it("derives every square token from wide unscaled; only the art box and footer differ", () => {
		expect(OG_SQUARE_STYLE.canvasWidth).toBe(OG_WIDE_STYLE.canvasWidth);
		expect(OG_SQUARE_STYLE.canvasHeight).toBe(OG_WIDE_STYLE.canvasHeight);
		expect(OG_SQUARE_STYLE.titleSize).toBe(OG_SQUARE_TITLE_PX);
		expect(OG_SQUARE_STYLE.titleSize).toBe(OG_WIDE_STYLE.titleSize);
		expect(OG_SQUARE_STYLE.brandLogo).toBe(OG_WIDE_STYLE.brandLogo);
		expect(OG_SQUARE_STYLE.brandSize).toBe(OG_WIDE_STYLE.brandSize);
		expect(OG_SQUARE_STYLE.brandGap).toBe(OG_WIDE_STYLE.brandGap);
		expect(OG_SQUARE_STYLE.icon).toBe(OG_WIDE_STYLE.icon);
		expect(OG_SQUARE_STYLE.iconGap).toBe(OG_WIDE_STYLE.iconGap);
		expect(OG_SQUARE_STYLE.artRadius).toBe(OG_WIDE_STYLE.artRadius);
		expect(OG_SQUARE_STYLE.artPad).toBe(OG_WIDE_STYLE.artPad);
		expect(OG_SQUARE_STYLE.metaSize).toBe(OG_WIDE_STYLE.metaSize);
		expect(OG_SQUARE_STYLE.podcastSize).toBe(OG_WIDE_STYLE.podcastSize); // pragma: allowlist secret
		expect(OG_SQUARE_STYLE.podcastSizeMin).toBe(OG_WIDE_STYLE.podcastSizeMin); // pragma: allowlist secret
		expect(OG_SQUARE_STYLE.chromePadX).toBe(OG_WIDE_STYLE.chromePadX);
		expect(OG_SQUARE_STYLE.chromePadY).toBe(OG_WIDE_STYLE.chromePadY);
		expect(OG_SQUARE_STYLE.titleMaxLines).toBe(OG_WIDE_STYLE.titleMaxLines);
		expect(OG_SQUARE_STYLE.titleLineHeight).toBe(OG_WIDE_STYLE.titleLineHeight);
		// Art box is what the fixed 630 canvas leaves: 630 − 112 brand − 4 − 131 footer.
		expect(squareArtMaxHeight()).toBe(383);
		expect(OG_SQUARE_ART_MAX).toBe(squareArtMaxHeight());
		expect(OG_SQUARE_ART_MAX_WIDTH).toBe(511);
		// Production title column includes textPaddingX (1200 − 40 − 28 − 383 − 32 − 36).
		expect(squareTitleContentWidth()).toBe(681);
	});

	describe("large-card framing (Api#244: X centre-crops summary_large_image to 1.91:1)", () => {
		for (const aspect of ["wide", "square"] as const) {
			it(`renders ${aspect} cards on the 1200×630 canvas so X crops nothing`, () => {
				const canvas = ogCardCanvasSize(aspect);
				expect(canvas).toEqual({ width: 1200, height: 630 });
				// X frames large cards at 1.91:1; anything taller loses the brand bar + show name.
				const xFrameHeight = Math.round(canvas.width / 1.91);
				expect(canvas.height - xFrameHeight).toBeLessThanOrEqual(2);
			});
		}

		it("never grows the square canvas past 1.91:1 to fit art, brand, and a two-line footer", () => {
			const stack =
				squareBrandBarHeight() + squareArtMaxHeight() + OG_SQUARE_STYLE.bodyPadBottom + squareFooterHeight();
			expect(stack).toBeLessThanOrEqual(squareCanvasHeight());
			expect(squareCanvasHeight()).toBe(OG_WIDE_STYLE.canvasHeight);
		});

		it("fits 4:3 art at the full square art height (no letterboxed 16:9-looking strip)", () => {
			const box = ogCardArtMaxBox("square");
			expect(fitArtWithin(640, 480, box.width, box.height)).toEqual({ width: 511, height: 383 });
			expect(fitArtWithin(480, 360, box.width, box.height)).toEqual({ width: 511, height: 383 });
		});

		it("keeps 1:1 art square and caps wider-than-4:3 art at the box width", () => {
			const box = ogCardArtMaxBox("square");
			expect(fitArtWithin(640, 640, box.width, box.height)).toEqual({ width: 383, height: 383 });
			expect(fitArtWithin(1280, 720, box.width, box.height)).toEqual({ width: 511, height: 287 });
		});

		it("leaves the title column room next to 4:3 square-card art", () => {
			expect(squareTitleContentWidth(OG_SQUARE_ART_MAX_WIDTH)).toBe(553);
		});
	});

	it("uses one title size per canvas and centres the title on the art", () => {
		expect(ogTitleFontSize("wide")).toBe(72);
		expect(ogTitleFontSize("square")).toBe(72);
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
