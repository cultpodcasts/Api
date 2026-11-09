import { OG_SQUARE_TITLE_PX, OG_WIDE_TITLE_PX } from "./ogShareImageText";

/**
 * Large-card aspect every summary_large_image consumer frames to (X, Facebook,
 * LinkedIn, Slack). A canvas taller than this is centre-cropped by X, which cut
 * the brand bar and show name off every square card (Api#244).
 */
export const OG_LARGE_CARD_ASPECT = 1200 / 630;

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

/**
 * Square cards (Spotify / Apple / BBC Sounds 1:1 art) share the wide 1200×630
 * canvas and the wide type scale, so X never crops them (Api#244). Only the
 * episode-art box and the footer differ: the footer stacks duration / date /
 * icons on the right so the show name gets the full leftover width.
 */
export const OG_SQUARE_STYLE = {
	canvasWidth: OG_WIDE_STYLE.canvasWidth,
	canvasHeight: OG_WIDE_STYLE.canvasHeight,
	textPaddingX: OG_WIDE_STYLE.textPaddingX,
	textPaddingY: OG_WIDE_STYLE.textPaddingY,
	artPad: OG_WIDE_STYLE.artPad,
	gap: OG_WIDE_STYLE.gap,
	artRadius: OG_WIDE_STYLE.artRadius,
	iconGap: OG_WIDE_STYLE.iconGap,
	iconRadius: OG_WIDE_STYLE.iconRadius,
	brandSize: OG_WIDE_STYLE.brandSize,
	brandLetterSpacing: OG_WIDE_STYLE.brandLetterSpacing,
	brandLineHeight: OG_WIDE_STYLE.brandLineHeight,
	brandMarginBottom: OG_WIDE_STYLE.brandMarginBottom,
	brandLogo: OG_WIDE_STYLE.brandLogo,
	brandGap: OG_WIDE_STYLE.brandGap,
	brandBarExtraBottom: OG_WIDE_STYLE.brandBarExtraBottom,
	titleSize: OG_SQUARE_TITLE_PX,
	titleLineHeight: OG_WIDE_STYLE.titleLineHeight,
	titleMarginBottom: OG_WIDE_STYLE.titleMarginBottom,
	titleMaxLines: OG_WIDE_STYLE.titleMaxLines,
	titleColumnPadLeftExtra: OG_WIDE_STYLE.titleColumnPadLeftExtra,
	/** Same as wide: 48px always, 2 lines, then ellipsis. Width is leftover footer, not art. */
	podcastSize: OG_WIDE_STYLE.podcastSize, // pragma: allowlist secret
	podcastSizeMin: OG_WIDE_STYLE.podcastSizeMin, // pragma: allowlist secret
	podcastMaxLines: OG_WIDE_STYLE.podcastMaxLines, // pragma: allowlist secret
	podcastLineHeight: OG_WIDE_STYLE.podcastLineHeight, // pragma: allowlist secret
	podcastMarginBottom: OG_WIDE_STYLE.podcastMarginBottom, // pragma: allowlist secret
	metaSize: OG_WIDE_STYLE.metaSize,
	metaRowGap: OG_WIDE_STYLE.metaRowGap,
	chromePadX: OG_WIDE_STYLE.chromePadX,
	chromePadY: OG_WIDE_STYLE.chromePadY,
	icon: OG_WIDE_STYLE.icon,
	footerPadTop: OG_WIDE_STYLE.footerPadTop,
	footerMetaGap: OG_WIDE_STYLE.footerMetaGap,
	bodyPadBottom: OG_WIDE_STYLE.bodyPadBottom
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

export function squareFooterHeight(): number {
	const s = OG_SQUARE_STYLE;
	return (
		s.footerPadTop +
		Math.max(squareStackedMetaHeight(), squareTwoLineShowNameHeight()) +
		s.chromePadY
	);
}

/** Square canvas height: fixed at the wide 630 so the card stays 1200×630 (1.91:1). */
export function squareCanvasHeight(): number {
	return OG_SQUARE_STYLE.canvasHeight;
}

/**
 * Square episode-art box: whatever height the fixed 630 canvas leaves after the
 * brand bar and a two-line show-name footer (383px). The canvas never grows to
 * fit the art — growing it is what X cropped (Api#244).
 */
export function squareArtMaxHeight(): number {
	return (
		squareCanvasHeight() -
		squareBrandBarHeight() -
		OG_SQUARE_STYLE.bodyPadBottom -
		squareFooterHeight()
	);
}

/** Square 1:1 art box edge (see `squareArtMaxHeight`). */
export const OG_SQUARE_ART_MAX = squareArtMaxHeight();

/**
 * Square-card art box width: room for 4:3 art at the full art height, so a 4:3
 * source is not shrunk into a letterboxed strip inside a 1:1 box. 1:1 art still
 * renders `OG_SQUARE_ART_MAX` square; anything wider than 4:3 is width-capped.
 */
export const OG_SQUARE_ART_MAX_WIDTH = Math.round((OG_SQUARE_ART_MAX * 4) / 3);

/**
 * Title column content width on the square card (wide columns chrome).
 * Includes `textPaddingX` — same arithmetic as production compose.
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

/** Canvas px per card aspect. Both are 1200×630 (`OG_LARGE_CARD_ASPECT`). */
export function ogCardCanvasSize(aspect: "wide" | "square"): { width: number; height: number } {
	return aspect === "wide"
		? { width: OG_WIDE_STYLE.canvasWidth, height: OG_WIDE_STYLE.canvasHeight }
		: { width: OG_SQUARE_STYLE.canvasWidth, height: squareCanvasHeight() };
}

/** Max box episode art is fitted into (source aspect kept, never cropped). */
export function ogCardArtMaxBox(aspect: "wide" | "square"): { width: number; height: number } {
	return aspect === "wide"
		? { width: OG_WIDE_STYLE.artMaxWidth, height: OG_WIDE_STYLE.artMaxHeight }
		: { width: OG_SQUARE_ART_MAX_WIDTH, height: squareArtMaxHeight() };
}

export function ogTitleFontSize(aspect: "wide" | "square"): number {
	return aspect === "wide" ? OG_WIDE_STYLE.titleSize : OG_SQUARE_STYLE.titleSize;
}

/** Satori ignores flex vertical center; pad the title block to the art midline. */
export function ogTitlePadTop(artHeight: number, titleLineBox: number, lineCount: number): number {
	return Math.max(0, Math.floor((artHeight - titleLineBox * lineCount) / 2));
}

/**
 * Cap title lines to what fits in the art column. Square cards letterbox short
 * sources (16:9 → 287px); a fixed 5-line / 400px block would paint into the footer.
 */
export function ogTitleMaxLinesForArt(
	artHeight: number,
	titleLineBox: number,
	titleMaxLines: number
): number {
	return Math.min(titleMaxLines, Math.max(1, Math.floor(artHeight / titleLineBox)));
}
