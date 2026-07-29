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

/**
 * Page-details for SSR / OG tags.
 * - Existing shortener KV: never rewrite; use image for og:image only if already on the record.
 * - Missing KV: fall back to search, create the record (incl. search-index image encoding), then use it.
 * - When an image exists, `image` is the Api `/og-image` Worker URL (CF logo overlay + Free-tier fallback).
 */
function pageDetailsFromKv(podcastName: string, meta: ShortnerRecord, requestUrl: string): IPageDetails {
    const share = shareImageFromStorage(meta);
    const image = share?.image
        ? buildBrandedOgImageUrl(requestUrl, share.image, share.imageAspect)
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
    const isSsr = c.req.query("ssr") == "true";
    logCollector.addMessage(`ssr=${isSsr}`);
    AddResponseHeaders(c, {
        methods: ["GET", "OPTIONS"]
    });
    const episodeId = c.req.param('episodeId');
    const podcastName = decodeURIComponent(c.req.param('podcastName') ?? "");
    if (!episodeId || !podcastName) {
        logCollector.addMessage(`Missing episode-id or podcast-name from request to api. Podcast-name: '${podcastName}', episode-id '${episodeId}'`);
        console.error(logCollector.toEndpointLog());
        return c.text(logCollector.message!, 400);
    }

    const key = new GuidService().toBase64(episodeId);
    const episodeKvWithMetaData = await c.env.shortner.getWithMetadata<ShortnerRecord>(key);
    const kvMeta = episodeKvWithMetaData?.metadata;
    const kvTitle = kvMeta?.episodeTitle;
    const kvExists = episodeKvWithMetaData != null && episodeKvWithMetaData.value != null;
    const requestUrl = c.req.url;

    if (kvExists && kvTitle && kvMeta) {
        logCollector.addMessage(`Found kv-meta-data with key '${key}'. podcast-name: '${podcastName}', episode-title: '${kvTitle}', episode-id: '${episodeId}', hasShareImage=${!!shareImageFromStorage(kvMeta)}.`);
        console.log(logCollector.toEndpointLog());
        return c.json(pageDetailsFromKv(podcastName, kvMeta, requestUrl));
    }

    if (kvExists) {
        logCollector.addMessage(`KV key '${key}' exists but metadata incomplete; leaving unchanged and not recreating.`);
        if (kvMeta) {
            console.log(logCollector.toEndpointLog());
            return c.json(pageDetailsFromKv(podcastName, kvMeta, requestUrl));
        }
        console.error(logCollector.toEndpointLog());
        return c.text(logCollector.message!, 400);
    }

    const search: oDataSearchModel = {
        search: "",
        filter: `(podcastName eq '${podcastName.replaceAll("'", "''")}') and (id eq '${episodeId}')`,
        orderby: "release desc",
        skip: "0"
    };
    const response = await fetch(`${c.env.apihost}`, {
        cf: {
            cacheEverything: true,
            cacheTtl: 600
        },
        headers: {
            "api-key": c.env.apikey,
            "content-type": "application/json;charset=UTF-8",
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
            const shortnerRecord: ShortnerRecord = {
                episodeTitle: episode.episodeTitle,
                releaseDate: releaseDate,
                duration: episode.duration,
                image: storage?.image,
                youtubeId: storage?.youtubeId,
                imageAspect: storage?.imageAspect
            };
            logCollector.addMessage("Found item-in-search; creating new shortener KV (incl. share image when available).");
            const encodedPodcastName =
                encodeURIComponent(podcastName)
                    .replaceAll("(", "%28")
                    .replaceAll(")", "%29");
            await c.env.shortner.put(key, `${encodedPodcastName}/${episodeId}`, { metadata: shortnerRecord });
            logCollector.addMessage(`Stored kv item with key '${key}'`);
            console.log(logCollector.toEndpointLog());
            return Response.json(pageDetailsFromKv(podcastName, shortnerRecord, requestUrl));
        }
        logCollector.addMessage(`No item for episode-uuid '${episodeId}' and podcast-name '${podcastName}'`);
        console.error(logCollector.toEndpointLog());
        return c.text(logCollector.message!, 400);
    }

    logCollector.addMessage(`Search-api responded with status '${response.status}'`);
    console.error(logCollector.toEndpointLog());
    return c.text(logCollector.message!, 400);
}
