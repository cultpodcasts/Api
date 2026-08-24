import { Context } from "hono";
import { ImageResponse } from "workers-og";
import { Env } from "./Env";
import {
	isAllowedShareImageSourceHost,
	parseOgImageAspect
} from "./episodeShareImage";
import { parseOgPlatforms, platformIconDataUrl, type OgPlatform } from "./ogCardPlatforms";
import { fitArtWithin, readImageSize } from "./ogArtSize";
import { longestTokenLength, ogTitleCharBudget, truncateOgText } from "./ogShareImageText";
import { brandLogoDataUrl } from "./ogBrandLogo";
import { formatOgDuration, formatOgReleaseDate } from "./ogShareImageMeta";
import instrumentSerifRegular from "./fonts/InstrumentSerif-Regular.woff";
import instrumentSerifItalic from "./fonts/InstrumentSerif-Italic.woff";
import figtreeRegular from "./fonts/Figtree-Regular.woff";
import figtreeSemiBold from "./fonts/Figtree-SemiBold.woff";

const INK = "#0b0d12";
const AMBER = "#f5c056";
const TEXT_SECONDARY = "#f0f2f5";
const TEXT_META = "#e8ebf0";
const WHITE = "#ffffff";

type CardAspect = "wide" | "square";

/** Flush-left art (no frame) + packed text column — same layout for both aspects. */
const CARD_SCALE = {
	wide: {
		width: 1200,
		height: 630,
		/** Outer pad around the text column only; art bleeds to the left edge. */
		textPaddingX: 36,
		textPaddingY: 40,
		artPad: 28,
		gap: 8,
		/** Max box for episode art; displayed size keeps the source aspect ratio. */
		artMaxWidth: 720,
		artMaxHeight: 500,
		artRadius: 12,
		iconGap: 14,
		iconRadius: 10,
		/** Single-line brand; font > logo so Instrument Serif caps meet logo diameter. */
		brandSize: 64,
		brandLetterSpacing: 0.4,
		brandMarginBottom: 4,
		brandLogo: 58,
		brandGap: 14,
		titleLarge: 52,
		titleSmall: 40,
		titleThreshold: 48,
		/** Soften type when any single token is this long (unspaced compounds / URLs). */
		longWordThreshold: 16,
		titleLineHeight: 1.14,
		titleMarginBottom: 14,
		podcastSize: 40, // pragma: allowlist secret
		podcastMarginBottom: 0, // pragma: allowlist secret
		metaSize: 32,
		metaLetterSpacing: 0,
		iconsMarginTop: 0,
		chromePadX: 40,
		chromePadY: 8,
		icon: 52,
		/** Ceiling; effective cap is line-budgeted from text column width (ellipsis stays visible). */
		titleMax: 140,
		titleMaxLines: 4,
		podcastMax: 56 // pragma: allowlist secret
	},
	square: {
		width: 800,
		height: 418,
		textPaddingX: 28,
		textPaddingY: 28,
		artPad: 20,
		gap: 4,
		artMaxWidth: 360,
		artMaxHeight: 378,
		artRadius: 10,
		icon: 36,
		iconGap: 8,
		iconRadius: 8,
		brandSize: 44,
		brandLetterSpacing: 0.3,
		brandMarginBottom: 10,
		brandLogo: 32,
		brandGap: 10,
		titleLarge: 34,
		titleSmall: 28,
		titleThreshold: 40,
		longWordThreshold: 14,
		titleLineHeight: 1.14,
		titleMarginBottom: 8,
		podcastSize: 20, // pragma: allowlist secret
		podcastMarginBottom: 6, // pragma: allowlist secret
		metaSize: 22,
		metaLetterSpacing: 0,
		iconsMarginTop: 20,
		titleMax: 110,
		titleMaxLines: 3,
		podcastMax: 48 // pragma: allowlist secret
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

function titleFontSize(
	title: string,
	s: (typeof CARD_SCALE)[CardAspect]
): number {
	if (title.length > s.titleThreshold || longestTokenLength(title) >= s.longWordThreshold) {
		return s.titleSmall;
	}
	return s.titleLarge;
}

/** Content width of the text column (art flush-left; padding on the copy side only). */
function textColumnContentWidth(aspect: CardAspect, artWidth: number): number {
	const s = CARD_SCALE[aspect];
	return s.width - s.artPad - artWidth - (s.gap + 20) - s.textPaddingX;
}

/** Truncate so the ellipsis lands within titleMaxLines (not clipped by max-height). */
function truncateTitleForCard(aspect: CardAspect, rawTitle: string, artWidth: number): string {
	const s = CARD_SCALE[aspect];
	const fontSize = titleFontSize(rawTitle, s);
	const budget = Math.min(
		s.titleMax,
		ogTitleCharBudget({
			columnWidth: textColumnContentWidth(aspect, artWidth),
			fontSize,
			maxLines: s.titleMaxLines
		})
	);
	return truncateOgText(rawTitle, budget);
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
	return { width: s.artMaxWidth, height: s.artMaxHeight };
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


function brandBarHtml(s: (typeof CARD_SCALE)[CardAspect], logo: string): string {
	return `<div style="display:flex;flex-direction:row;align-items:center;gap:${s.brandGap}px;margin-bottom:${s.brandMarginBottom}px;flex-shrink:0;">
      <img src="${logo}" width="${s.brandLogo}" height="${s.brandLogo}" style="width:${s.brandLogo}px;height:${s.brandLogo}px;flex-shrink:0;" />
      <div style="display:flex;color:${AMBER};font-family:'Instrument Serif';font-size:${s.brandSize}px;letter-spacing:${s.brandLetterSpacing}px;line-height:0.85;white-space:nowrap;">CULT PODCASTS</div> <!-- pragma: allowlist secret -->
    </div>`;
}

/**
 * Wide cards: centred site mark on top (tight to the art), title + podcast
 * name in the right column, bottom row = service icons + duration/date.
 * Square cards keep a compact right stack with larger meta type.
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
}): string {
	const s = CARD_SCALE[input.aspect];
	const titleSize = titleFontSize(input.title, s);
	const titleMaxHeight = Math.ceil(titleSize * s.titleLineHeight * s.titleMaxLines);
	const chips = platformChipsHtml(input.platforms, s.icon, s.iconGap, s.iconRadius);
	const logo = brandLogoDataUrl();
	const titleHtml = `<div style="display:flex;color:${WHITE};font-family:Figtree;font-weight:600;font-size:${titleSize}px;line-height:${s.titleLineHeight};margin-bottom:${s.titleMarginBottom}px;word-break:break-word;overflow-wrap:anywhere;max-height:${titleMaxHeight}px;overflow:hidden;">${escapeHtml(input.title)}</div>`;
	const podcastHtml = input.podcast // pragma: allowlist secret
		? `<div style="display:flex;color:${TEXT_SECONDARY};font-family:Figtree;font-weight:600;font-size:${s.podcastSize}px;line-height:1.2;margin-bottom:${s.podcastMarginBottom}px;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(input.podcast)}</div>` // pragma: allowlist secret
		: "";
	const durationHtml = input.duration
		? `<div style="display:flex;color:${TEXT_META};font-family:Figtree;font-weight:600;font-size:${s.metaSize}px;line-height:1.25;word-break:break-word;">${escapeHtml(input.duration)}</div>`
		: "";
	const dateHtml = input.date
		? `<div style="display:flex;color:${TEXT_META};font-family:Figtree;font-weight:600;font-size:${s.metaSize}px;line-height:1.25;margin-top:6px;word-break:break-word;">${escapeHtml(input.date)}</div>`
		: "";

	if (input.aspect === "wide") {
		const padX = s.chromePadX;
		const padY = s.chromePadY;
		const footerMeta = [input.duration, input.date]
			.filter((part) => part.length > 0)
			.map(
				(part) =>
					`<div style="display:flex;color:${TEXT_META};font-family:Figtree;font-weight:600;font-size:${s.metaSize}px;line-height:1.2;word-break:break-word;">${escapeHtml(part)}</div>`
			)
			.join("");
		const footerMetaHtml = footerMeta
			? `<div style="display:flex;flex-direction:row;align-items:center;gap:28px;flex-shrink:0;">${footerMeta}</div>`
			: "";
		const footerHtml =
			chips || footerMetaHtml
				? `<div style="display:flex;flex-direction:row;align-items:center;justify-content:space-between;flex-shrink:0;padding:4px ${padX}px ${padY}px ${padX}px;">${chips}${footerMetaHtml}</div>`
				: "";
		return `
<div style="display:flex;flex-direction:column;width:${s.width}px;height:${s.height}px;background:${INK};font-family:Figtree;">
  <div style="display:flex;flex-direction:row;align-items:center;justify-content:center;gap:${s.brandGap}px;flex-shrink:0;padding:${padY}px ${padX}px 2px ${padX}px;">
    <img src="${logo}" width="${s.brandLogo}" height="${s.brandLogo}" style="width:${s.brandLogo}px;height:${s.brandLogo}px;flex-shrink:0;" />
    <div style="display:flex;color:${AMBER};font-family:'Instrument Serif';font-size:${s.brandSize}px;letter-spacing:${s.brandLetterSpacing}px;line-height:0.85;white-space:nowrap;">CULT PODCASTS</div> <!-- pragma: allowlist secret -->
  </div>
  <div style="display:flex;flex-direction:row;flex-grow:1;align-items:center;min-height:0;padding:4px ${padX}px 4px ${s.artPad}px;">
    <div style="display:flex;flex-shrink:0;align-items:center;">
      <img src="${input.artDataUrl}" width="${input.artWidth}" height="${input.artHeight}" style="width:${input.artWidth}px;height:${input.artHeight}px;border-radius:${s.artRadius}px;flex-shrink:0;" />
    </div>
    <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:center;min-width:0;overflow:hidden;padding:0 ${s.textPaddingX}px 0 ${s.gap + 24}px;">
      ${titleHtml}
      ${podcastHtml}
    </div>
  </div>
  ${footerHtml}
</div>`;
	}

	return `
<div style="display:flex;flex-direction:row;width:${s.width}px;height:${s.height}px;background:${INK};font-family:Figtree;align-items:center;">
  <div style="display:flex;flex-shrink:0;padding:${s.artPad}px 0 ${s.artPad}px ${s.artPad}px;">
    <img src="${input.artDataUrl}" width="${input.artWidth}" height="${input.artHeight}" style="width:${input.artWidth}px;height:${input.artHeight}px;border-radius:${s.artRadius}px;flex-shrink:0;" />
  </div>
  <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:center;min-width:0;overflow:hidden;padding:${s.textPaddingY}px ${s.textPaddingX}px ${s.textPaddingY}px ${s.gap + 20}px;">
    ${brandBarHtml(s, logo)}
    ${titleHtml}
    ${podcastHtml}
    ${durationHtml}
    ${dateHtml}
    ${chips ? `<div style="display:flex;margin-top:${s.iconsMarginTop}px;flex-shrink:0;">${chips}</div>` : ""}
  </div>
</div>`;
}

/**
 * Composed OG card via workers-og (Satori + properly module-bundled Wasm).
 * GET /og-image?u=&a=wide|square&t=&p=&d=&r=&pl=youtube,spotify,apple,bbc
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
	const podcast = truncateOgText(c.req.query("p")?.trim() || "", scale.podcastMax); // pragma: allowlist secret
	const duration = formattedDuration(c.req.query("d"));
	const date = formattedDate(c.req.query("r"));
	const platforms = parseOgPlatforms(c.req.query("pl"));

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
		const title = truncateTitleForCard(aspect, rawTitle, artSize.width);

		const html = cardHtml({
			aspect,
			artDataUrl,
			artWidth: artSize.width,
			artHeight: artSize.height,
			title,
			podcast, // pragma: allowlist secret
			duration,
			date,
			platforms
		});

		return new ImageResponse(html, {
			width: scale.width,
			height: scale.height,
			fonts: [
				{ name: "Instrument Serif", data: instrumentSerifRegular, weight: 400, style: "normal" },
				{ name: "Instrument Serif", data: instrumentSerifItalic, weight: 400, style: "italic" },
				{ name: "Figtree", data: figtreeRegular, weight: 400, style: "normal" },
				{ name: "Figtree", data: figtreeSemiBold, weight: 600, style: "normal" }
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
