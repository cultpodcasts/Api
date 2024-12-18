import { ActionContext } from "./ActionContext";
import { LogCollector } from "./LogCollector";
import { oDataSearchModel } from "./oDataSearchModel";
import { GuidService } from "./guid-service";
import { IPageDetails } from "./ipage-details";
import { ShortnerRecord } from "./ShortnerRecord";

export async function getPageDetails(c: ActionContext): Promise<Response> {
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    const isSsr = c.req.query("ssr") == "true";
    logCollector.addMessage(`ssr=${isSsr}`);
    const episodeId = c.req.param('episodeId');
    const podcastName = c.req.param('podcastName');
    if (episodeId && podcastName) {
        const key = new GuidService().toBase64(episodeId);
        let foundInKv: boolean = false;
        const episodeKvWithMetaData = await c.env.shortner.getWithMetadata<ShortnerRecord>(key);
        if (episodeKvWithMetaData != null && episodeKvWithMetaData.metadata != null) {
            foundInKv = true;
            var episodeTitle = episodeKvWithMetaData.metadata.episodeTitle;
            if (episodeTitle) {
                var pagedetails: IPageDetails = {
                    description: podcastName,
                    title: `${episodeTitle} | ${podcastName}`,
                    releaseDate: episodeKvWithMetaData.metadata.releaseDate,
                    duration: episodeKvWithMetaData.metadata.duration
                };
                logCollector.add({ message: `Found kv-meta-data with key '${key}'. podcast-name: '${podcastName}', episode-title: '${episodeTitle}', episode-id: '${episodeId}'.` });
                console.log(logCollector.toEndpointLog());
                return new Response(JSON.stringify(pagedetails));
            } else {
                logCollector.add({ message: `Missing kv-meta-data with key '${key}', episode-id '${episodeId}'.` });
                console.error(logCollector.toEndpointLog());
                return new Response(logCollector.message, { status: 400 });
            }
        } else {
            const search: oDataSearchModel = {
                search: "",
                filter: `(podcastName eq '${podcastName.replaceAll("'", "''")}') and (id eq '${episodeId}')`,
                orderby: "release desc",
                skip: "0"
            }
            let requestBody = JSON.stringify(search);
            const url = `${c.env.apihost}`;
            let response = await fetch(url, {
                cf: {
                    cacheEverything: true,
                    cacheTtl: 600
                },
                headers: {
                    "api-key": c.env.apikey,
                    "content-type": "application/json;charset=UTF-8",
                },
                body: requestBody,
                method: "POST"
            });
            if (response.status == 200) {
                const searchJson = await response.json<any>();
                if (searchJson.value && searchJson.value.length == 1) {
                    const episode = searchJson.value[0];
                    const dateComponents = (episode.release as string).split("T")[0].split("-");
                    const releaseDate = `${dateComponents[2]}/${dateComponents[1]}/${dateComponents[0]}`;
                    var shortnerRecord: ShortnerRecord = {
                        episodeTitle: episode.episodeTitle,
                        releaseDate: releaseDate,
                        duration: episode.duration
                    };
                    logCollector.addMessage("Found item-in-search");
                    const encodedPodcastName =
                        encodeURIComponent(podcastName)
                            .replaceAll("(", "%28")
                            .replaceAll(")", "%29");
                    await c.env.shortner.put(key, `${encodedPodcastName}/${episodeId}`, { metadata: shortnerRecord })
                    logCollector.add({ message: `Stored item in kv with key '${key}'` });
                    console.log(logCollector.toEndpointLog());
                    var pagedetails: IPageDetails = {
                        description: podcastName,
                        title: `${episode.episodeTitle} | ${podcastName}`,
                        releaseDate: releaseDate,
                        duration: episode.duration
                    };
                    return Response.json(pagedetails);
                } else {
                    logCollector.add({ message: `No item for episode-uuid '${episodeId}' and podcast-name '${podcastName}'` });
                    console.error(logCollector.toEndpointLog());
                    return new Response(logCollector.message, { status: 400 });
                }
            } else {
                logCollector.add({ message: `Search-api responded with status '${response.status}'` });
                console.error(logCollector.toEndpointLog());
                return new Response(logCollector.message, { status: 400 });
            }
        }
    } else {
        logCollector.add({ message: `Missing episode-id or podcast-name from request to api. Podcast-name: '${podcastName}', episode-id '${episodeId}'` });
        console.error(logCollector.toEndpointLog());
        return new Response(logCollector.message, { status: 400 });
    }
}
