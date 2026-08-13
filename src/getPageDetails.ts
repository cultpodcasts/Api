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
	toShareImageStorage
} from "./episodeShareImage";
import { inferOgPlatforms, serializeOgPlatforms } from "./ogCardPlatforms";

/**
 * Page-details for SSR / OG tags.
 * - Existing shortener KV: never rewrite; use image for og:image only if already on the record.
 * - Missing KV: fall back to search, create the record (incl. search-index image encoding), then use it.
 * - When an image exists, `image` is the Api `/og-image` composed-card URL.
 */
function pageDetailsFromKv(podcastName: string, meta: ShortnerRecord, requestUrl: string): IPageDetails {
	const share = shareImageFromStorage(meta);
	const platforms =
		meta.platforms ||
		serializeOgPlatforms(
			inferOgPlatforms({
				youtubeId: meta.youtubeId,
				image: meta.image
			})
		);
	const image = share?.image
		? buildBrandedOgImageUrl(requestUrl, share.image, share.imageAspect, {
				title: meta.episodeTitle,
				podcast: podcastName,
				duration: meta.duration,
				date: meta.releaseDate,
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
		logCollector.emit({ event: "page_details.kv_hit", outcome: "success" });
		return c.json(pageDetailsFromKv(podcastName, kvMeta, requestUrl));
	}

	if (kvExists) {
		logCollector.addMessage(`KV key '${key}' exists but metadata incomplete; leaving unchanged and not recreating.`);
		if (kvMeta) {
			logCollector.emit({ event: "page_details.kv_incomplete", outcome: "success" });
			return c.json(pageDetailsFromKv(podcastName, kvMeta, requestUrl));
		}
		logCollector.emitError({ event: "page_details.kv_missing_title", outcome: "error" });
		return c.text(logCollector.message ?? "Missing kv-meta-data", 400);
	}

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

	if (response.status == 200) {
		const searchJson = await response.json<any>();
		if (searchJson.value && searchJson.value.length == 1) {
			const episode = searchJson.value[0];
			const dateComponents = (episode.release as string).split("T")[0].split("-");
			const releaseDate = `${dateComponents[2]}/${dateComponents[1]}/${dateComponents[0]}`;
			const storage = toShareImageStorage(episode);
			const platforms = serializeOgPlatforms(
				inferOgPlatforms({
					youtube: episode.youtube,
					youtubeId: episode.youtubeId ?? storage?.youtubeId,
					spotify: episode.spotify,
					apple: episode.apple,
					bbc: episode.bbc,
					image: storage?.image
				})
			);
			const shortnerRecord: ShortnerRecord = {
				episodeTitle: episode.episodeTitle,
				releaseDate: releaseDate,
				duration: episode.duration,
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
			return Response.json(pageDetailsFromKv(podcastName, shortnerRecord, requestUrl));
		}
		logCollector.addMessage(
			`No item for episode-uuid '${episodeId}' and podcast-name '${podcastName}'`
		);
		logCollector.emitError({ event: "page_details.search_empty", outcome: "error" });
		return c.text(logCollector.message ?? "No item found", 400);
	}

	logCollector.add({ status: response.status });
	logCollector.addMessage(`Search-api responded with status '${response.status}'`);
	logCollector.emitError({ event: "page_details.search_upstream_error", outcome: "error" });
	return c.text(logCollector.message ?? "Search-api error", 400);
}
