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
 * Square canvas stays 800×418 (existing OG size). All other linear tokens are
 * wide × 800/1200. Canvas height is not 630×2/3 (420).
 */
export const OG_SQUARE_STYLE = {
	canvasWidth: 800,
	canvasHeight: 418,
	textPaddingX: scaleWidePx(OG_WIDE_STYLE.textPaddingX),
	textPaddingY: scaleWidePx(OG_WIDE_STYLE.textPaddingY),
	artPad: scaleWidePx(OG_WIDE_STYLE.artPad),
	gap: scaleWidePx(OG_WIDE_STYLE.gap),
	artMaxWidth: scaleWidePx(OG_WIDE_STYLE.artMaxWidth),
	artMaxHeight: scaleWidePx(OG_WIDE_STYLE.artMaxHeight),
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
	podcastSize: scaleWidePx(OG_WIDE_STYLE.podcastSize), // pragma: allowlist secret
	podcastSizeMin: scaleWidePx(OG_WIDE_STYLE.podcastSizeMin), // pragma: allowlist secret
	/** Two lines at 32px do not fit under 1:1 art on 418px canvas; footer uses one line. */
	podcastMaxLines: 2, // pragma: allowlist secret
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

/** Two show-name lines at the full square size — taller than the canvas leftover under 293px art. */
export function squareTwoLineShowNameHeight(): number {
	const s = OG_SQUARE_STYLE;
	return Math.ceil(s.podcastSize * s.podcastLineHeight * s.podcastMaxLines); // pragma: allowlist secret
}

export function squareBrandBarHeight(): number {
	const s = OG_SQUARE_STYLE;
	const mark = Math.max(s.brandLogo, Math.round(s.brandSize * s.brandLineHeight));
	return s.chromePadY + mark + s.brandBarExtraBottom;
}

/**
 * Square 1:1 art must leave a footer tall enough for the stacked meta column.
 * Two full-size show-name rows do not fit that leftover; show name is one line
 * and uses the width the meta column no longer occupies.
 */
export function squareArtMaxHeight(): number {
	const s = OG_SQUARE_STYLE;
	const footer = s.footerPadTop + squareStackedMetaHeight() + s.chromePadY;
	return Math.max(
		1,
		s.canvasHeight - squareBrandBarHeight() - s.bodyPadBottom - footer
	);
}

/** Show-name column: full footer minus the bottom-right meta stack. */
export function squareShowNameContentWidth(): number {
	const s = OG_SQUARE_STYLE;
	const metaCol = Math.max(
		s.icon * 3 + s.iconGap * 2,
		Math.ceil(s.metaSize * 0.62 * 12)
	);
	return Math.max(80, s.canvasWidth - s.artPad - s.chromePadX - metaCol - 16);
}

export function ogTitleFontSize(aspect: "wide" | "square"): number {
	return aspect === "wide" ? OG_WIDE_STYLE.titleSize : OG_SQUARE_STYLE.titleSize;
}

/** Satori ignores flex vertical center; pad the title block to the art midline. */
export function ogTitlePadTop(artHeight: number, titleLineBox: number, lineCount: number): number {
	return Math.max(0, Math.floor((artHeight - titleLineBox * lineCount) / 2));
}
