import { ActionContext } from "./ActionContext";
import { LogCollector } from "./LogCollector";
import { oDataSearchModel } from "./oDataSearchModel";
import { GuidService } from "./guid-service";
import { IPageDetails } from "./ipage-details";
import { ShortnerRecord } from "./ShortnerRecord";
import { AddResponseHeaders } from "./AddResponseHeaders";
import {
	buildBrandedOgImageUrl,
	shareImageFromStorage,
	toShareImageStorage,
	type SearchEpisodeImageFields
} from "./episodeShareImage";
import {
	inferOgPlatforms,
	resolveOgPlatformsForCard,
	serializeOgPlatforms,
	type OgPlatformSource
} from "./ogCardPlatforms";
import { formatOgDuration, formatOgReleaseDate } from "./ogShareImageMeta";

/**
 * Page-details for SSR / OG tags.
 * - Existing shortener KV: never rewrite; use image for og:image only if already on the record.
 * - Missing KV: fall back to search, create the record (incl. search-index image encoding), then use it.
 * - When an image exists, `image` is the Api `/og-image` composed-card URL.
 * - OG platform chips are resolved from live search on every request (KV `platforms` is create-time only).
 */
function searchHitToPlatformSource(episode: Record<string, unknown>): OgPlatformSource {
	const str = (key: string): string | undefined => {
		const value = episode[key];
		return typeof value === "string" ? value : undefined;
	};
	return {
		youtube: str("youtube"),
		youtubeId: str("youtubeId") ?? str("youTubeId"),
		youTubeId: str("youTubeId"),
		spotify: str("spotify"),
		spotifyId: str("spotifyId"),
		apple: str("apple"),
		appleId: str("appleId"),
		bbc: str("bbc"),
		image: str("image")
	};
}

function pageDetailsFromKv(
	podcastName: string,
	meta: ShortnerRecord,
	requestUrl: string,
	searchHit?: Record<string, unknown>
): IPageDetails {
	const share = shareImageFromStorage(meta);
	const platforms = resolveOgPlatformsForCard(
		{
			platforms: meta.platforms,
			youtubeId: meta.youtubeId,
			image: meta.image
		},
		searchHit ? searchHitToPlatformSource(searchHit) : undefined
	);
	const image = share?.image
		? buildBrandedOgImageUrl(requestUrl, share.image, share.imageAspect, {
				title: meta.episodeTitle,
				podcast: podcastName,
				duration: formatOgDuration(meta.duration),
				date: formatOgReleaseDate(meta.releaseDate),
				platforms: platforms || undefined
			})
		: undefined;
	return {
		description: podcastName,
		title: `${meta.episodeTitle} | ${podcastName}`,
		releaseDate: meta.releaseDate,
		duration: meta.duration,
		image,
		imageAspect: share?.imageAspect ?? meta.imageAspect
	};
}

async function lookupSearchEpisode(
	c: ActionContext,
	podcastName: string,
	episodeId: string
): Promise<{ status: number; episode?: Record<string, unknown> }> {
	const search: oDataSearchModel = {
		search: "",
		filter: `(podcastName eq '${podcastName.replaceAll("'", "''")}') and (id eq '${episodeId}')`,
		orderby: "release desc",
		skip: "0"
	};
	const response = await fetch(`${c.env.apihost}`, {
		cf: { cacheEverything: true, cacheTtl: 600 },
		headers: {
			"api-key": c.env.apikey,
			"content-type": "application/json;charset=UTF-8"
		},
		body: JSON.stringify(search),
		method: "POST"
	});
	if (response.status !== 200) {
		return { status: response.status };
	}
	const searchJson = await response.json<{ value?: Record<string, unknown>[] }>();
	if (searchJson.value && searchJson.value.length === 1) {
		return { status: 200, episode: searchJson.value[0] };
	}
	return { status: 200 };
}

export async function getPageDetails(c: ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "getPageDetails" });
	const isSsr = c.req.query("ssr") == "true";
	logCollector.addMessage(`ssr=${isSsr}`);
	AddResponseHeaders(c, { methods: ["GET", "OPTIONS"] });

	const episodeId = c.req.param("episodeId");
	const podcastName = decodeURIComponent(c.req.param("podcastName") ?? "");
	if (!episodeId || !podcastName) {
		logCollector.addMessage(
			`Missing episode-id or podcast-name from request to api. Podcast-name: '${podcastName}', episode-id '${episodeId}'`
		);
		logCollector.emitError({ event: "page_details.missing_params", outcome: "error" });
		return c.text(logCollector.message ?? "Missing episode-id or podcast-name", 400);
	}

	const key = new GuidService().toBase64(episodeId);
	const episodeKvWithMetaData = await c.env.shortner.getWithMetadata<ShortnerRecord>(key);
	const kvMeta = episodeKvWithMetaData?.metadata;
	const kvTitle = kvMeta?.episodeTitle;
	const kvExists = episodeKvWithMetaData != null && episodeKvWithMetaData.value != null;
	const requestUrl = c.req.url;

	if (kvExists && kvTitle && kvMeta) {
		logCollector.addMessage(
			`Found kv-meta-data with key '${key}'. podcast-name: '${podcastName}', episode-title: '${kvTitle}', episode-id: '${episodeId}', hasShareImage=${!!shareImageFromStorage(kvMeta)}.`
		);
		const lookup = await lookupSearchEpisode(c, podcastName, episodeId);
		if (lookup.episode) {
			logCollector.addMessage("Resolved OG platforms from live search (KV metadata left unchanged).");
		}
		logCollector.emit({ event: "page_details.kv_hit", outcome: "success" });
		return c.json(pageDetailsFromKv(podcastName, kvMeta, requestUrl, lookup.episode));
	}

	if (kvExists) {
		logCollector.addMessage(`KV key '${key}' exists but metadata incomplete; leaving unchanged and not recreating.`);
		if (kvMeta) {
			const lookup = await lookupSearchEpisode(c, podcastName, episodeId);
			logCollector.emit({ event: "page_details.kv_incomplete", outcome: "success" });
			return c.json(pageDetailsFromKv(podcastName, kvMeta, requestUrl, lookup.episode));
		}
		logCollector.emitError({ event: "page_details.kv_missing_title", outcome: "error" });
		return c.text(logCollector.message ?? "Missing kv-meta-data", 400);
	}

	const lookup = await lookupSearchEpisode(c, podcastName, episodeId);
	if (lookup.status == 200) {
		if (lookup.episode) {
			const episode = lookup.episode;
			const releaseRaw = typeof episode.release === "string" ? episode.release : "";
			const dateComponents = releaseRaw.split("T")[0].split("-");
			const releaseDate =
				dateComponents.length === 3
					? `${dateComponents[2]}/${dateComponents[1]}/${dateComponents[0]}`
					: releaseRaw;
			const storage = toShareImageStorage(episode as SearchEpisodeImageFields);
			const fromSearch = searchHitToPlatformSource(episode);
			const platforms = serializeOgPlatforms(
				inferOgPlatforms({
					...fromSearch,
					youtubeId: fromSearch.youtubeId ?? storage?.youtubeId,
					image: storage?.image
				})
			);
			const shortnerRecord: ShortnerRecord = {
				episodeTitle: String(episode.episodeTitle ?? ""),
				releaseDate: releaseDate,
				duration: typeof episode.duration === "string" ? episode.duration : undefined,
				image: storage?.image,
				youtubeId: storage?.youtubeId,
				imageAspect: storage?.imageAspect,
				platforms: platforms || undefined
			};
			logCollector.addMessage(
				"Found item-in-search; creating new shortener KV (incl. share image when available)."
			);
			const encodedPodcastName = encodeURIComponent(podcastName)
				.replaceAll("(", "%28")
				.replaceAll(")", "%29");
			await c.env.shortner.put(key, `${encodedPodcastName}/${episodeId}`, { metadata: shortnerRecord });
			logCollector.addMessage(`Stored kv item with key '${key}'`);
			logCollector.emit({ event: "page_details.search_hit", outcome: "success" });
			return Response.json(pageDetailsFromKv(podcastName, shortnerRecord, requestUrl, episode));
		}
		logCollector.addMessage(
			`No item for episode-uuid '${episodeId}' and podcast-name '${podcastName}'`
		);
		logCollector.emitError({ event: "page_details.search_empty", outcome: "error" });
		return c.text(logCollector.message ?? "No item found", 400);
	}

	logCollector.add({ status: lookup.status });
	logCollector.addMessage(`Search-api responded with status '${lookup.status}'`);
	logCollector.emitError({ event: "page_details.search_upstream_error", outcome: "error" });
	return c.text(logCollector.message ?? "Search-api error", 400);
}
