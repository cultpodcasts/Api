import { OG_SQUARE_TITLE_PX, OG_WIDE_TITLE_PX } from "./ogShareImageText";

/** Square canvas width ÷ wide canvas width. Linear tokens scale by this. */
export const OG_SQUARE_FROM_WIDE_SCALE = 800 / 1200;

export const OG_STYLE_FACES = {
	brand: "Instrument Serif",
	ui: "Figtree",
	titleWeight: 600
} as const;

export const OG_STYLE_COLORS = {
	ink: "#0b0d12",
	amber: "#f5c056",
	title: "#ffffff",
	showName: "#f0f2f5",
	meta: "#e8ebf0"
} as const;

/** Wide `wl=columns` tokens — source of truth. Do not change to “fix” square. */
export const OG_WIDE_STYLE = {
	canvasWidth: 1200,
	canvasHeight: 630,
	textPaddingX: 36,
	textPaddingY: 40,
	artPad: 28,
	gap: 8,
	artMaxWidth: 700,
	artMaxHeight: 440,
	artRadius: 12,
	iconGap: 10,
	iconRadius: 10,
	brandSize: 96,
	brandLetterSpacing: 0.4,
	brandLineHeight: 0.85,
	brandMarginBottom: 4,
	brandLogo: 88,
	brandGap: 16,
	brandBarExtraBottom: 12,
	titleSize: OG_WIDE_TITLE_PX,
	titleLineHeight: 1.1,
	titleMarginBottom: 12,
	titleMaxLines: 5,
	titleColumnPadLeftExtra: 24,
	podcastSize: 48, // pragma: allowlist secret
	podcastSizeMin: 32, // pragma: allowlist secret
	podcastMaxLines: 2, // pragma: allowlist secret
	podcastLineHeight: 1.15, // pragma: allowlist secret
	podcastMarginBottom: 0, // pragma: allowlist secret
	metaSize: 28,
	metaRowGap: 16,
	chromePadX: 40,
	chromePadY: 12,
	icon: 32,
	footerPadTop: 8,
	footerMetaGap: 8,
	bodyPadBottom: 4
} as const;

export function scaleWidePx(widePx: number): number {
	return Math.round(widePx * OG_SQUARE_FROM_WIDE_SCALE);
}

/**
 * Square 1:1 art box. Not wide’s 440: on an 800-wide canvas that left only ~269px
 * for the title at 48px (≈ one word per line → early `...`). 320 leaves ~389px so
 * multi-word titles wrap instead of truncating by line 5 (Api#244).
 * Canvas height still grows with this art plus chrome. Other linear tokens stay
 * wide × 800/1200 unless noted.
 */
export const OG_SQUARE_ART_MAX = 320;

export const OG_SQUARE_STYLE = {
	canvasWidth: 800,
	textPaddingX: scaleWidePx(OG_WIDE_STYLE.textPaddingX),
	textPaddingY: scaleWidePx(OG_WIDE_STYLE.textPaddingY),
	artPad: scaleWidePx(OG_WIDE_STYLE.artPad),
	gap: scaleWidePx(OG_WIDE_STYLE.gap),
	artMaxWidth: OG_SQUARE_ART_MAX,
	artMaxHeight: OG_SQUARE_ART_MAX,
	artRadius: scaleWidePx(OG_WIDE_STYLE.artRadius),
	iconGap: scaleWidePx(OG_WIDE_STYLE.iconGap),
	iconRadius: scaleWidePx(OG_WIDE_STYLE.iconRadius),
	brandSize: scaleWidePx(OG_WIDE_STYLE.brandSize),
	brandLetterSpacing: Math.round(OG_WIDE_STYLE.brandLetterSpacing * OG_SQUARE_FROM_WIDE_SCALE * 100) / 100,
	brandLineHeight: OG_WIDE_STYLE.brandLineHeight,
	brandMarginBottom: scaleWidePx(OG_WIDE_STYLE.brandMarginBottom),
	brandLogo: scaleWidePx(OG_WIDE_STYLE.brandLogo),
	brandGap: scaleWidePx(OG_WIDE_STYLE.brandGap),
	brandBarExtraBottom: scaleWidePx(OG_WIDE_STYLE.brandBarExtraBottom),
	titleSize: OG_SQUARE_TITLE_PX,
	titleLineHeight: OG_WIDE_STYLE.titleLineHeight,
	titleMarginBottom: scaleWidePx(OG_WIDE_STYLE.titleMarginBottom),
	titleMaxLines: OG_WIDE_STYLE.titleMaxLines,
	titleColumnPadLeftExtra: scaleWidePx(OG_WIDE_STYLE.titleColumnPadLeftExtra),
	/** Same as wide: 48px always, 2 lines, then ellipsis. Width is leftover footer, not art. */
	podcastSize: OG_WIDE_STYLE.podcastSize, // pragma: allowlist secret
	podcastSizeMin: OG_WIDE_STYLE.podcastSizeMin, // pragma: allowlist secret
	podcastMaxLines: OG_WIDE_STYLE.podcastMaxLines, // pragma: allowlist secret
	podcastLineHeight: OG_WIDE_STYLE.podcastLineHeight, // pragma: allowlist secret
	podcastMarginBottom: OG_WIDE_STYLE.podcastMarginBottom, // pragma: allowlist secret
	metaSize: scaleWidePx(OG_WIDE_STYLE.metaSize),
	metaRowGap: scaleWidePx(OG_WIDE_STYLE.metaRowGap),
	chromePadX: scaleWidePx(OG_WIDE_STYLE.chromePadX),
	chromePadY: scaleWidePx(OG_WIDE_STYLE.chromePadY),
	icon: scaleWidePx(OG_WIDE_STYLE.icon),
	footerPadTop: scaleWidePx(OG_WIDE_STYLE.footerPadTop),
	footerMetaGap: scaleWidePx(OG_WIDE_STYLE.footerMetaGap),
	bodyPadBottom: scaleWidePx(OG_WIDE_STYLE.bodyPadBottom)
} as const;

/** Duration + date + icons, each on its own row (square footer, bottom-right). */
export function squareStackedMetaHeight(): number {
	const s = OG_SQUARE_STYLE;
	return s.metaSize + s.footerMetaGap + s.metaSize + s.footerMetaGap + s.icon;
}

/** Two show-name lines at the full square size (same max as wide). */
export function squareTwoLineShowNameHeight(): number {
	const s = OG_SQUARE_STYLE;
	return Math.ceil(s.podcastSize * s.podcastLineHeight * s.podcastMaxLines); // pragma: allowlist secret
}

export function squareBrandBarHeight(): number {
	const s = OG_SQUARE_STYLE;
	const mark = Math.max(s.brandLogo, Math.round(s.brandSize * s.brandLineHeight));
	return s.chromePadY + mark + s.brandBarExtraBottom;
}

/** Square episode-art box (see `OG_SQUARE_ART_MAX`). */
export function squareArtMaxHeight(): number {
	return OG_SQUARE_ART_MAX;
}

export function squareFooterHeight(): number {
	const s = OG_SQUARE_STYLE;
	return (
		s.footerPadTop +
		Math.max(squareStackedMetaHeight(), squareTwoLineShowNameHeight()) +
		s.chromePadY
	);
}

/**
 * Square canvas height grows with `OG_SQUARE_ART_MAX` art plus brand/footer chrome.
 * Do not force a shorter fixed canvas when art shrinks (Api#244).
 */
export function squareCanvasHeight(): number {
	return (
		squareBrandBarHeight() +
		squareArtMaxHeight() +
		OG_SQUARE_STYLE.bodyPadBottom +
		squareFooterHeight()
	);
}

/**
 * Title column content width on the square card (wide columns chrome, scaled).
 * Includes `textPaddingX` — same arithmetic as production compose.
 * Default art width is `OG_SQUARE_ART_MAX` (389px at 320 art; was 269 at 440).
 */
export function squareTitleContentWidth(artWidth: number = OG_SQUARE_ART_MAX): number {
	const s = OG_SQUARE_STYLE;
	const textPadLeft = s.gap + s.titleColumnPadLeftExtra;
	return s.canvasWidth - s.chromePadX - s.artPad - artWidth - textPadLeft - s.textPaddingX;
}

/** Gap between leftover show-name column and stacked duration / date / icons. */
export const OG_SQUARE_FOOTER_GUTTER = 28;

/** Right-column reservation: icons row or a 12-glyph date line, whichever is wider. */
export function squareStackedMetaWidth(): number {
	const s = OG_SQUARE_STYLE;
	const iconRow = s.icon * 3 + s.iconGap * 2;
	const dateLine = Math.ceil(s.metaSize * 0.62 * 12);
	return Math.max(iconRow, dateLine);
}

/** Show-name column: footer minus pads, gutter, and the reserved right column. */
export function squareShowNameContentWidth(): number {
	const s = OG_SQUARE_STYLE;
	return Math.max(
		80,
		s.canvasWidth - s.artPad - s.chromePadX - squareStackedMetaWidth() - OG_SQUARE_FOOTER_GUTTER
	);
}

export function ogTitleFontSize(aspect: "wide" | "square"): number {
	return aspect === "wide" ? OG_WIDE_STYLE.titleSize : OG_SQUARE_STYLE.titleSize;
}

/** Satori ignores flex vertical center; pad the title block to the art midline. */
export function ogTitlePadTop(artHeight: number, titleLineBox: number, lineCount: number): number {
	return Math.max(0, Math.floor((artHeight - titleLineBox * lineCount) / 2));
}
