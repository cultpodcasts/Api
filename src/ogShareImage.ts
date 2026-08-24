import { Context } from "hono";
import { ImageResponse } from "workers-og";
import { Env } from "./Env";
import {
	isAllowedShareImageSourceHost,
	parseOgImageAspect
} from "./episodeShareImage";
import { parseOgPlatforms, platformIconDataUrl, type OgPlatform } from "./ogCardPlatforms";
import { fitArtWithin, readImageSize } from "./ogArtSize";
import {
	fitOgWrappedText,
	layoutOgTitle,
	OG_SQUARE_TITLE_PX,
	OG_WIDE_TITLE_PX
} from "./ogShareImageText";
import {
	OG_SQUARE_STYLE,
	OG_STYLE_COLORS,
	OG_STYLE_FACES,
	OG_WIDE_STYLE,
	ogTitleFontSize,
	ogTitlePadTop,
	squareArtMaxHeight,
	squareShowNameContentWidth
} from "./ogShareImageStyle";
import { brandLogoDataUrl } from "./ogBrandLogo";
import { formatOgDuration, formatOgReleaseDate } from "./ogShareImageMeta";
import { parseWideLayout, type WideLayoutId } from "./ogWideLayout";
import instrumentSerifRegular from "./fonts/InstrumentSerif-Regular.woff";
import instrumentSerifItalic from "./fonts/InstrumentSerif-Italic.woff";
import figtreeRegular from "./fonts/Figtree-Regular.woff";
import figtreeSemiBold from "./fonts/Figtree-SemiBold.woff";

const INK = OG_STYLE_COLORS.ink;
const AMBER = OG_STYLE_COLORS.amber;
const TEXT_SECONDARY = OG_STYLE_COLORS.showName;
const TEXT_META = OG_STYLE_COLORS.meta;
const WHITE = OG_STYLE_COLORS.title;

type CardAspect = "wide" | "square";

/** Flush-left art (no frame) + packed text column — same layout for both aspects. */
const CARD_SCALE = {
	wide: {
		width: OG_WIDE_STYLE.canvasWidth,
		height: OG_WIDE_STYLE.canvasHeight,
		/** Outer pad around the text column only; art bleeds to the left edge. */
		textPaddingX: OG_WIDE_STYLE.textPaddingX,
		textPaddingY: OG_WIDE_STYLE.textPaddingY,
		artPad: OG_WIDE_STYLE.artPad,
		gap: OG_WIDE_STYLE.gap,
		/** Max box for episode art; displayed size keeps the source aspect ratio. */
		artMaxWidth: OG_WIDE_STYLE.artMaxWidth,
		artMaxHeight: OG_WIDE_STYLE.artMaxHeight,
		artRadius: OG_WIDE_STYLE.artRadius,
		iconGap: OG_WIDE_STYLE.iconGap,
		iconRadius: OG_WIDE_STYLE.iconRadius,
		/** Single-line brand; font > logo so Instrument Serif caps meet logo diameter. */
		brandSize: OG_WIDE_STYLE.brandSize,
		brandLetterSpacing: OG_WIDE_STYLE.brandLetterSpacing,
		brandMarginBottom: OG_WIDE_STYLE.brandMarginBottom,
		brandLogo: OG_WIDE_STYLE.brandLogo,
		brandGap: OG_WIDE_STYLE.brandGap,
		titleLarge: OG_WIDE_TITLE_PX,
		titleSmall: OG_WIDE_TITLE_PX,
		titleThreshold: 90,
		/** Soften type when any single token is this long (unspaced compounds / URLs). */
		longWordThreshold: 22,
		titleLineHeight: OG_WIDE_STYLE.titleLineHeight,
		titleMarginBottom: OG_WIDE_STYLE.titleMarginBottom,
		podcastSize: OG_WIDE_STYLE.podcastSize, // pragma: allowlist secret
		podcastSizeMin: OG_WIDE_STYLE.podcastSizeMin, // pragma: allowlist secret
		podcastMaxLines: OG_WIDE_STYLE.podcastMaxLines, // pragma: allowlist secret
		podcastMarginBottom: OG_WIDE_STYLE.podcastMarginBottom, // pragma: allowlist secret
		metaSize: OG_WIDE_STYLE.metaSize,
		metaLetterSpacing: 0,
		iconsMarginTop: 0,
		chromePadX: OG_WIDE_STYLE.chromePadX,
		chromePadY: OG_WIDE_STYLE.chromePadY,
		icon: OG_WIDE_STYLE.icon,
		/** Ceiling; effective cap is line-budgeted from text column width (ellipsis stays visible). */
		titleMax: 140,
		titleMaxLines: OG_WIDE_STYLE.titleMaxLines,
		podcastMax: 80 // pragma: allowlist secret
	},
	/**
	 * Square canvas (Spotify / Apple art). Chrome is the wide columns style guide
	 * scaled by 800/1200 (see docs/og-share-image-cards.md). Do not change `wide`.
	 */
	square: {
		width: OG_SQUARE_STYLE.canvasWidth,
		height: OG_SQUARE_STYLE.canvasHeight,
		textPaddingX: OG_SQUARE_STYLE.textPaddingX,
		textPaddingY: OG_SQUARE_STYLE.textPaddingY,
		artPad: OG_SQUARE_STYLE.artPad,
		gap: OG_SQUARE_STYLE.gap,
		artMaxWidth: OG_SQUARE_STYLE.artMaxWidth,
		artMaxHeight: squareArtMaxHeight(),
		artRadius: OG_SQUARE_STYLE.artRadius,
		iconGap: OG_SQUARE_STYLE.iconGap,
		iconRadius: OG_SQUARE_STYLE.iconRadius,
		brandSize: OG_SQUARE_STYLE.brandSize,
		brandLetterSpacing: OG_SQUARE_STYLE.brandLetterSpacing,
		brandMarginBottom: OG_SQUARE_STYLE.brandMarginBottom,
		brandLogo: OG_SQUARE_STYLE.brandLogo,
		brandGap: OG_SQUARE_STYLE.brandGap,
		titleLarge: OG_SQUARE_TITLE_PX,
		titleSmall: OG_SQUARE_TITLE_PX,
		titleThreshold: 90,
		longWordThreshold: 22,
		titleLineHeight: OG_SQUARE_STYLE.titleLineHeight,
		titleMarginBottom: OG_SQUARE_STYLE.titleMarginBottom,
		podcastSize: OG_SQUARE_STYLE.podcastSize, // pragma: allowlist secret
		podcastSizeMin: OG_SQUARE_STYLE.podcastSizeMin, // pragma: allowlist secret
		podcastMaxLines: 1, // pragma: allowlist secret
		podcastMarginBottom: OG_SQUARE_STYLE.podcastMarginBottom, // pragma: allowlist secret
		metaSize: OG_SQUARE_STYLE.metaSize,
		metaLetterSpacing: 0,
		iconsMarginTop: 0,
		chromePadX: OG_SQUARE_STYLE.chromePadX,
		chromePadY: OG_SQUARE_STYLE.chromePadY,
		icon: OG_SQUARE_STYLE.icon,
		titleMax: 140,
		titleMaxLines: OG_SQUARE_STYLE.titleMaxLines,
		podcastMax: 80 // pragma: allowlist secret
	}
} as const;

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function titleFontSize(_title: string, aspect: CardAspect): number {
	return ogTitleFontSize(aspect);
}

/** Content width of the text column (art flush-left; padding on the copy side only). */
function textColumnContentWidth(aspect: CardAspect, artWidth: number): number {
	const s = CARD_SCALE[aspect];
	return s.width - s.artPad - artWidth - (s.gap + 20) - s.textPaddingX;
}

/** Title column on the default wide layout, including the body row's right pad. */
function columnsTitleContentWidth(artWidth: number): number {
	const s = CARD_SCALE.wide;
	const textPadLeft = s.gap + OG_WIDE_STYLE.titleColumnPadLeftExtra;
	return s.width - s.chromePadX - s.artPad - artWidth - textPadLeft - s.textPaddingX;
}

/** Title column on the square card (wide columns chrome, scaled). */
function squareColumnsTitleContentWidth(artWidth: number): number {
	const s = CARD_SCALE.square;
	const textPadLeft = s.gap + OG_SQUARE_STYLE.titleColumnPadLeftExtra;
	return s.width - s.chromePadX - s.artPad - artWidth - textPadLeft - s.textPaddingX;
}

function formattedDuration(raw?: string): string {
	return formatOgDuration(raw) ?? "";
}

function formattedDate(raw?: string): string {
	return formatOgReleaseDate(raw) ?? "";
}

function defaultArtSize(aspect: CardAspect): { width: number; height: number } {
	const s = CARD_SCALE[aspect];
	if (aspect === "wide") {
		return fitArtWithin(16, 9, s.artMaxWidth, s.artMaxHeight);
	}
	return fitArtWithin(1, 1, s.artMaxWidth, s.artMaxHeight);
}

async function imageBytesToDataUrl(bytes: ArrayBuffer, contentType: string): Promise<string> {
	const type = contentType.split(";")[0] || "image/jpeg";
	const binary = new Uint8Array(bytes);
	let s = "";
	const chunk = 0x8000;
	for (let i = 0; i < binary.length; i += chunk) {
		s += String.fromCharCode(...binary.subarray(i, i + chunk));
	}
	return `data:${type};base64,${btoa(s)}`;
}

/** Icon-only service marks — no “Watch on” / “Listen on” text. SVG shapes are authoritative (no extra clip radius). */
function platformChipsHtml(platforms: OgPlatform[], size: number, gap: number, _radius: number): string {
	if (platforms.length === 0) {
		return "";
	}
	const chips = platforms
		.map((p) => {
			const src = platformIconDataUrl(p);
			return `<img src="${src}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;" />`;
		})
		.join("");
	return `<div style="display:flex;flex-direction:row;gap:${gap}px;align-items:center;">${chips}</div>`;
}


function metaPartsHtml(duration: string, date: string, size: number, row: boolean): string {
	const parts = [duration, date].filter((part) => part.length > 0);
	if (parts.length === 0) {
		return "";
	}
	return parts
		.map(
			(part, i) =>
				`<div style="display:flex;color:${TEXT_META};font-family:${OG_STYLE_FACES.ui};font-weight:${OG_STYLE_FACES.titleWeight};font-size:${size}px;line-height:1.2;${row ? "" : i > 0 ? "margin-top:6px;" : ""}word-break:break-word;">${escapeHtml(part)}</div>`
		)
		.join(row && parts.length === 2
			? `<div style="display:flex;color:${TEXT_META};font-family:${OG_STYLE_FACES.ui};font-weight:${OG_STYLE_FACES.titleWeight};font-size:${size}px;line-height:1.2;">·</div>`
			: "");
}

function wideBrandBarHtml(
	s: (typeof CARD_SCALE)["wide"],
	logo: string
): string {
	return `<div style="display:flex;flex-direction:row;align-items:center;justify-content:center;gap:${s.brandGap}px;flex-shrink:0;padding:${s.chromePadY}px ${s.chromePadX}px ${OG_WIDE_STYLE.brandBarExtraBottom}px ${s.chromePadX}px;">
    <img src="${logo}" width="${s.brandLogo}" height="${s.brandLogo}" style="width:${s.brandLogo}px;height:${s.brandLogo}px;flex-shrink:0;" />
    <div style="display:flex;color:${AMBER};font-family:'${OG_STYLE_FACES.brand}';font-size:${s.brandSize}px;letter-spacing:${s.brandLetterSpacing}px;line-height:${OG_WIDE_STYLE.brandLineHeight};white-space:nowrap;">CULT PODCASTS</div> <!-- pragma: allowlist secret -->
  </div>`;
}

/**
 * Satori flattens nested title flex items into one wrapping run (hyphens vanish,
 * the raw word reflows). One Figtree text node with \\n keeps breaks and hyphens.
 * Do not list Instrument Serif as a fallback — Satori then paints the whole title
 * in the serif face (different look and optical size).
 */
function titleBlockHtml(
	lines: readonly string[],
	fontSize: number,
	lineHeight: number,
	extraStyle = ""
): string {
	const text = escapeHtml(lines.join("\n"));
	return `<div style="display:flex;flex-direction:column;white-space:pre;color:${WHITE};font-family:${OG_STYLE_FACES.ui};font-weight:${OG_STYLE_FACES.titleWeight};font-style:normal;letter-spacing:0;font-size:${fontSize}px;line-height:${lineHeight};${extraStyle}">${text}</div>`;
}

/**
 * Wide cards: centred site mark on top (tight to the art). `wl=` picks chrome.
 * Square cards use the same columns chrome, scaled (see style guide in docs).
 */
function cardHtml(input: {
	aspect: CardAspect;
	artDataUrl: string;
	artWidth: number;
	artHeight: number;
	title: string;
	podcast: string; // pragma: allowlist secret
	duration: string;
	date: string;
	platforms: OgPlatform[];
	wideLayout: WideLayoutId;
}): string {
	const s = CARD_SCALE[input.aspect];
	const titleSize = titleFontSize(input.title, input.aspect);
	const titleColumnWidth =
		input.aspect === "wide" && input.wideLayout === "columns"
			? columnsTitleContentWidth(input.artWidth)
			: input.aspect === "square"
				? squareColumnsTitleContentWidth(input.artWidth)
				: textColumnContentWidth(input.aspect, input.artWidth);
	const titleLayout = layoutOgTitle({
		text: input.title,
		columnWidth: titleColumnWidth,
		fontSize: titleSize,
		maxLines: s.titleMaxLines
	});
	const chips = platformChipsHtml(input.platforms, s.icon, s.iconGap, s.iconRadius);
	const logo = brandLogoDataUrl();
	const titleLineBox = Math.ceil(titleSize * s.titleLineHeight);
	const titleHtml = titleBlockHtml(titleLayout.lines, titleSize, s.titleLineHeight, `margin-bottom:${s.titleMarginBottom}px;`);
	const showNameFit = fitOgWrappedText({
		text: input.podcast, // pragma: allowlist secret
		columnWidth:
			input.aspect === "wide"
				? input.artWidth
				: input.aspect === "square"
					? squareShowNameContentWidth()
					: textColumnContentWidth(input.aspect, input.artWidth),
		sizes: [s.podcastSize, Math.round((s.podcastSize + s.podcastSizeMin) / 2), s.podcastSizeMin], // pragma: allowlist secret
		maxLines: s.podcastMaxLines // pragma: allowlist secret
	});
	const showNameLineHeight = OG_WIDE_STYLE.podcastLineHeight;
	const showNameMaxHeight = Math.ceil(showNameFit.fontSize * showNameLineHeight * s.podcastMaxLines);
	const podcastHtml = showNameFit.text // pragma: allowlist secret
		? `<div style="display:flex;color:${TEXT_SECONDARY};font-family:${OG_STYLE_FACES.ui};font-weight:${OG_STYLE_FACES.titleWeight};font-size:${showNameFit.fontSize}px;line-height:${showNameLineHeight};margin-bottom:${s.podcastMarginBottom}px;word-break:break-word;overflow-wrap:anywhere;max-height:${showNameMaxHeight}px;overflow:hidden;">${escapeHtml(showNameFit.text)}</div>` // pragma: allowlist secret
		: "";

	if (input.aspect === "wide") {
		const padX = s.chromePadX;
		const padY = s.chromePadY;
		const textPadLeft = s.gap + OG_WIDE_STYLE.titleColumnPadLeftExtra;
		const rowMeta = metaPartsHtml(input.duration, input.date, s.metaSize, true);
		const stackMeta = metaPartsHtml(input.duration, input.date, s.metaSize, false);
		const rowMetaHtml = rowMeta
			? `<div style="display:flex;flex-direction:row;align-items:center;gap:${OG_WIDE_STYLE.metaRowGap}px;flex-shrink:0;">${rowMeta}</div>`
			: "";
		const artImg = `<img src="${input.artDataUrl}" width="${input.artWidth}" height="${input.artHeight}" style="width:${input.artWidth}px;height:${input.artHeight}px;border-radius:${s.artRadius}px;flex-shrink:0;" />`;
		const leftStack = `<div style="display:flex;flex-direction:column;flex-shrink:0;align-items:flex-start;gap:4px;">
      ${artImg}
      ${chips}
    </div>`;
		const textPad = `padding:0 ${s.textPaddingX}px 0 ${textPadLeft}px;`;
		let bodyAndFooter: string;
		if (input.wideLayout === "stack") {
			bodyAndFooter = `
  <div style="display:flex;flex-direction:row;flex-grow:1;align-items:flex-start;min-height:0;padding:2px ${padX}px 6px ${s.artPad}px;">
    ${leftStack}
    <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:center;min-width:0;overflow:hidden;${textPad}">
      ${titleHtml}
      ${podcastHtml}
      ${stackMeta ? `<div style="display:flex;flex-direction:column;margin-top:18px;">${stackMeta}</div>` : ""}
    </div>
  </div>`;
		} else if (input.wideLayout === "inline") {
			bodyAndFooter = `
  <div style="display:flex;flex-direction:row;flex-grow:1;align-items:flex-start;min-height:0;padding:2px ${padX}px 6px ${s.artPad}px;">
    ${leftStack}
    <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:center;min-width:0;overflow:hidden;${textPad}">
      ${titleHtml}
      ${podcastHtml}
      ${rowMetaHtml ? `<div style="display:flex;margin-top:18px;">${rowMetaHtml}</div>` : ""}
    </div>
  </div>`;
		} else if (input.wideLayout === "columns") {
			const footerMeta =
				rowMetaHtml || chips
					? `<div style="display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:${OG_WIDE_STYLE.footerMetaGap}px;">
      ${rowMetaHtml}
      ${chips}
    </div>`
					: "";
			const showName = podcastHtml; // pragma: allowlist secret
			const showFooter =
				showName || footerMeta
					? `<div style="display:flex;flex-direction:row;align-items:center;flex-shrink:0;padding:${OG_WIDE_STYLE.footerPadTop}px ${padX}px ${padY}px ${s.artPad}px;">
    <div style="display:flex;width:${input.artWidth}px;flex-shrink:0;align-items:center;">${showName}</div>
    <div style="display:flex;flex-grow:1;align-items:center;min-width:0;${textPad}">${footerMeta}</div>
  </div>`
					: "";
			const titleBlockHeight = titleLineBox * titleLayout.lines.length;
			const titlePadTop = ogTitlePadTop(input.artHeight, titleLineBox, titleLayout.lines.length);
			const columnsTitleHtml = titleBlockHtml(
				titleLayout.lines,
				titleSize,
				s.titleLineHeight,
				`flex-shrink:0;margin-top:${titlePadTop}px;height:${titleBlockHeight}px;`
			);
			bodyAndFooter = `
  <div style="display:flex;flex-direction:row;flex-grow:1;align-items:flex-start;min-height:0;padding:0 ${padX}px ${OG_WIDE_STYLE.bodyPadBottom}px ${s.artPad}px;">
    ${artImg}
    <div style="display:flex;flex-direction:column;height:${input.artHeight}px;flex-grow:1;min-width:0;padding:0 ${s.textPaddingX}px 0 ${textPadLeft}px;">
      ${columnsTitleHtml}
    </div>
  </div>
  ${showFooter}`;
		} else {
			bodyAndFooter = `
  <div style="display:flex;flex-direction:row;flex-grow:1;align-items:flex-start;min-height:0;padding:2px ${padX}px 2px ${s.artPad}px;">
    ${artImg}
    <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:center;min-width:0;overflow:hidden;${textPad}">
      ${titleHtml}
      ${podcastHtml}
    </div>
  </div>
  ${
		chips || rowMetaHtml
			? `<div style="display:flex;flex-direction:row;align-items:center;justify-content:space-between;flex-shrink:0;padding:2px ${padX}px 6px ${padX}px;">${chips}${rowMetaHtml}</div>`
			: ""
	}`;
		}
		return `
<div style="display:flex;flex-direction:column;width:${s.width}px;height:${s.height}px;background:${INK};font-family:${OG_STYLE_FACES.ui};">
  ${wideBrandBarHtml(CARD_SCALE.wide, logo)}
  ${bodyAndFooter}
</div>`;
	}

	const sq = CARD_SCALE.square;
	const padX = sq.chromePadX;
	const padY = sq.chromePadY;
	const textPadLeft = sq.gap + OG_SQUARE_STYLE.titleColumnPadLeftExtra;
	const stackMeta = metaPartsHtml(input.duration, input.date, sq.metaSize, false);
	const artImg = `<img src="${input.artDataUrl}" width="${input.artWidth}" height="${input.artHeight}" style="width:${input.artWidth}px;height:${input.artHeight}px;border-radius:${sq.artRadius}px;flex-shrink:0;" />`;
	const footerMeta =
		stackMeta || chips
			? `<div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;gap:${OG_SQUARE_STYLE.footerMetaGap}px;flex-shrink:0;">
      ${stackMeta}
      ${chips}
    </div>`
			: "";
	const showName = podcastHtml; // pragma: allowlist secret
	const showFooter =
		showName || footerMeta
			? `<div style="display:flex;flex-direction:row;align-items:flex-end;justify-content:space-between;flex-shrink:0;padding:${OG_SQUARE_STYLE.footerPadTop}px ${padX}px ${padY}px ${sq.artPad}px;">
    <div style="display:flex;flex-grow:1;min-width:0;margin-right:16px;align-items:flex-end;">${showName}</div>
    ${footerMeta}
  </div>`
			: "";
	const titleBlockHeight = titleLineBox * titleLayout.lines.length;
	const titlePadTop = ogTitlePadTop(input.artHeight, titleLineBox, titleLayout.lines.length);
	const columnsTitleHtml = titleBlockHtml(
		titleLayout.lines,
		titleSize,
		sq.titleLineHeight,
		`flex-shrink:0;margin-top:${titlePadTop}px;height:${titleBlockHeight}px;`
	);
	const squareBrand = `<div style="display:flex;flex-direction:row;align-items:center;justify-content:center;gap:${sq.brandGap}px;flex-shrink:0;padding:${sq.chromePadY}px ${sq.chromePadX}px ${OG_SQUARE_STYLE.brandBarExtraBottom}px ${sq.chromePadX}px;">
    <img src="${logo}" width="${sq.brandLogo}" height="${sq.brandLogo}" style="width:${sq.brandLogo}px;height:${sq.brandLogo}px;flex-shrink:0;" />
    <div style="display:flex;color:${AMBER};font-family:'${OG_STYLE_FACES.brand}';font-size:${sq.brandSize}px;letter-spacing:${sq.brandLetterSpacing}px;line-height:${OG_SQUARE_STYLE.brandLineHeight};white-space:nowrap;">CULT PODCASTS</div> <!-- pragma: allowlist secret -->
  </div>`;
	return `
<div style="display:flex;flex-direction:column;width:${sq.width}px;height:${sq.height}px;background:${INK};font-family:${OG_STYLE_FACES.ui};">
  ${squareBrand}
  <div style="display:flex;flex-direction:row;flex-grow:1;align-items:flex-start;min-height:0;padding:0 ${padX}px ${OG_SQUARE_STYLE.bodyPadBottom}px ${sq.artPad}px;">
    ${artImg}
    <div style="display:flex;flex-direction:column;height:${input.artHeight}px;flex-grow:1;min-width:0;padding:0 ${sq.textPaddingX}px 0 ${textPadLeft}px;">
      ${columnsTitleHtml}
    </div>
  </div>
  ${showFooter}
</div>`;
}

/**
 * Composed OG card via workers-og (Satori + properly module-bundled Wasm).
 * GET /og-image?u=&a=wide|square&t=&p=&d=&r=&pl=youtube,spotify,apple,bbc&wl=footer|columns|stack|inline
 */
export async function getOgShareImage(c: Context<{ Bindings: Env }>): Promise<Response> {
	const sourceParam = c.req.query("u");
	if (!sourceParam) {
		return c.text("Missing u (source image URL)", 400);
	}

	let sourceUrl: URL;
	try {
		sourceUrl = new URL(sourceParam);
	} catch {
		return c.text("Invalid source image URL", 400);
	}

	if (sourceUrl.protocol !== "https:") {
		return c.text("Source image must be https", 400);
	}

	if (!isAllowedShareImageSourceHost(sourceUrl.hostname)) {
		return c.text("Source image host is not allowed", 400);
	}

	const aspect = parseOgImageAspect(c.req.query("a"));
	const scale = CARD_SCALE[aspect];
	const rawTitle = c.req.query("t")?.trim() || "Episode";
	const podcast = c.req.query("p")?.trim() || ""; // pragma: allowlist secret
	const duration = formattedDuration(c.req.query("d"));
	const date = formattedDate(c.req.query("r"));
	const platforms = parseOgPlatforms(c.req.query("pl"));
	const wideLayout = parseWideLayout(c.req.query("wl"));

	try {
		const sourceResponse = await fetch(sourceUrl.toString());
		if (!sourceResponse.ok) {
			return Response.redirect(sourceUrl.toString(), 307);
		}

		const sourceBytes = await sourceResponse.arrayBuffer();
		const contentType = sourceResponse.headers.get("content-type") || "image/jpeg";
		const artDataUrl = await imageBytesToDataUrl(sourceBytes, contentType);
		const native = readImageSize(sourceBytes);
		const artSize = native
			? fitArtWithin(native.width, native.height, scale.artMaxWidth, scale.artMaxHeight)
			: defaultArtSize(aspect);
		const html = cardHtml({
			aspect,
			artDataUrl,
			artWidth: artSize.width,
			artHeight: artSize.height,
			title: rawTitle,
			podcast, // pragma: allowlist secret
			duration,
			date,
			platforms,
			wideLayout
		});

		return new ImageResponse(html, {
			width: scale.width,
			height: scale.height,
			fonts: [
				{ name: "Figtree", data: figtreeSemiBold, weight: 600, style: "normal" },
				{ name: "Figtree", data: figtreeRegular, weight: 400, style: "normal" },
				{ name: "Instrument Serif", data: instrumentSerifRegular, weight: 400, style: "normal" },
				{ name: "Instrument Serif", data: instrumentSerifItalic, weight: 400, style: "italic" }
			],
			headers: {
				"Cache-Control": "public, max-age=86400"
			}
		});
	} catch (err) {
		const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
		console.error("og-image card render failed; falling back to source", message, err);
		const headers = new Headers({
			Location: sourceUrl.toString(),
			"X-Og-Error": message.slice(0, 200)
		});
		return new Response(null, { status: 307, headers });
	}
}
