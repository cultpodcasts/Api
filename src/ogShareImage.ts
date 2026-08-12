import { Context } from "hono";
import { Env } from "./Env";
import {
	DEFAULT_OG_LOGO_URL,
	isAllowedShareImageSourceHost,
	parseOgImageAspect
} from "./episodeShareImage";

type ImageDrawOptions = {
	url: string;
	bottom?: number;
	right?: number;
	width?: number;
	height?: number;
	fit?: string;
	opacity?: number;
};

/**
 * Serves episode art with Cult Podcasts logo overlay via Cloudflare Images
 * transformations (Free: 5k unique transforms/month). On failure (incl. 9422),
 * redirects to the original source URL so OG crawlers still get an image.
 *
 * GET /og-image?u=<absolute-source-url>&a=wide|square
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
	const width = aspect === "wide" ? 1200 : 800;
	const logoWidth = aspect === "wide" ? 120 : 96;

	const draw: ImageDrawOptions[] = [
		{
			url: DEFAULT_OG_LOGO_URL,
			bottom: 16,
			right: 16,
			width: logoWidth,
			height: logoWidth,
			fit: "contain",
			opacity: 0.92
		}
	];

	const imageOptions: Record<string, unknown> = {
		width,
		fit: "scale-down",
		format: "jpeg",
		quality: 85,
		draw
	};

	try {
		const response = await fetch(sourceUrl.toString(), {
			cf: {
				image: imageOptions,
				cacheEverything: true,
				cacheTtl: 86400
			}
		} as RequestInit);

		if (response.ok || response.redirected) {
			const headers = new Headers(response.headers);
			headers.set("Cache-Control", "public, max-age=86400");
			headers.set("Content-Type", response.headers.get("Content-Type") ?? "image/jpeg");
			return new Response(response.body, {
				status: response.status,
				headers
			});
		}
	} catch {
		// Fall through to redirect — local/dev and Free-plan overruns (9422) included.
	}

	return Response.redirect(sourceUrl.toString(), 307);
}
