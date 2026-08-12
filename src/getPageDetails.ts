import { ActionContext } from "./ActionContext";
import { LogCollector } from "./LogCollector";
import { oDataSearchModel } from "./oDataSearchModel";
import { GuidService } from "./guid-service";
import { IPageDetails } from "./ipage-details";
import { ShortnerRecord } from "./ShortnerRecord";
import { AddResponseHeaders } from "./AddResponseHeaders";

export async function getPageDetails(c: ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "getPageDetails" });
	const isSsr = c.req.query("ssr") == "true";
	logCollector.add({ message: `ssr=${isSsr}` });
	AddResponseHeaders(c, { methods: ["GET", "OPTIONS"] });
	const episodeId = c.req.param("episodeId");
	const podcastName = decodeURIComponent(c.req.param("podcastName") ?? "");
	if (episodeId && podcastName) {
		const key = new GuidService().toBase64(episodeId);
		const episodeKvWithMetaData = await c.env.shortner.getWithMetadata<ShortnerRecord>(key);
		if (episodeKvWithMetaData != null && episodeKvWithMetaData.metadata != null) {
			var episodeTitle = episodeKvWithMetaData.metadata.episodeTitle;
			if (episodeTitle) {
				var pagedetails: IPageDetails = {
					description: podcastName,
					title: `${episodeTitle} | ${podcastName}`,
					releaseDate: episodeKvWithMetaData.metadata.releaseDate,
					duration: episodeKvWithMetaData.metadata.duration
				};
				logCollector.emit({ event: "page_details.kv_hit", outcome: "success" });
				return c.json(pagedetails);
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
		let requestBody = JSON.stringify(search);
		const url = `${c.env.apihost}`;
		let response = await fetch(url, {
			cf: { cacheEverything: true, cacheTtl: 600 },
			headers: {
				"api-key": c.env.apikey,
				"content-type": "application/json;charset=UTF-8"
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
				const encodedPodcastName = encodeURIComponent(podcastName)
					.replaceAll("(", "%28")
					.replaceAll(")", "%29");
				await c.env.shortner.put(key, `${encodedPodcastName}/${episodeId}`, { metadata: shortnerRecord });
				logCollector.emit({ event: "page_details.search_hit", outcome: "success" });
				var pagedetailsFromSearch: IPageDetails = {
					description: podcastName,
					title: `${episode.episodeTitle} | ${podcastName}`,
					releaseDate: releaseDate,
					duration: episode.duration
				};
				return Response.json(pagedetailsFromSearch);
			}
			logCollector.emitError({ event: "page_details.search_empty", outcome: "error" });
			return c.text(logCollector.message ?? "No item found", 400);
		}
		logCollector.add({ status: response.status });
		logCollector.emitError({ event: "page_details.search_upstream_error", outcome: "error" });
		return c.text(logCollector.message ?? "Search-api error", 400);
	}
	logCollector.emitError({ event: "page_details.missing_params", outcome: "error" });
	return c.text(logCollector.message ?? "Missing episode-id or podcast-name", 400);
}
