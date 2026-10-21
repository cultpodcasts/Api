import { ActionContext } from "./ActionContext";
import { buildBrandedOgImageUrl, resolveShareImageAspect, resolveShareImageAbsoluteUrl, type SearchEpisodeImageFields } from "./episodeShareImage";
import { GuidService } from "./guid-service";
import { IPageDetails } from "./ipage-details";
import { LogCollector } from "./LogCollector";
import { oDataSearchModel } from "./oDataSearchModel";

/** `/news/{name}` (NewsReport) and `/tv/{name}` (TvShowEpisode). Film has no hub. */
export type CatalogueHub = "news" | "tv";

const hubContentKind: Record<CatalogueHub, string> = {
	news: "NewsReport",
	tv: "TvShowEpisode"
};

const hubItemNoun: Record<CatalogueHub, string> = {
	news: "report",
	tv: "episode"
};

/**
 * `GET /pagedetails/{news|tv}/{name}` is a hub page, not an episode: the first segment is the hub and
 * the second is the outlet / show name. A second segment that is a UUID or a catalogue short id stays
 * on the episode path, so a podcast literally called "news" or "tv" keeps working.
 */
export function catalogueHubPageDetailsTarget(
	firstSegment: string | undefined,
	secondSegment: string | undefined
): { hub: CatalogueHub; name: string } | null {
	if (firstSegment !== "news" && firstSegment !== "tv") {
		return null;
	}
	const raw = secondSegment ?? "";
	let name = raw;
	try {
		// Same double decode as podcastName: the website pre-encodes "'" as %27 before encodeURIComponent.
		name = decodeURIComponent(raw);
	} catch {
		name = raw;
	}
	name = name.trim();
	if (!name) {
		return null;
	}
	const guids = new GuidService();
	if (guids.getEpisodeUuid(name) || guids.parseCatalogueShortId(name)) {
		return null;
	}
	return { hub: firstSegment, name };
}

/** OData filters for a hub: seriesName first, podcastName when the live index lacks seriesName. */
export function hubPageDetailsFilters(hub: CatalogueHub, name: string): readonly [string, string] {
	const escaped = name.replaceAll("'", "''");
	const kind = `contentKind eq '${hubContentKind[hub]}'`;
	return [`(seriesName eq '${escaped}') and (${kind})`, `(podcastName eq '${escaped}') and (${kind})`];
}

type HubSearch = { status: number; count: number; latest?: Record<string, unknown> };

async function searchHub(c: ActionContext, filter: string): Promise<HubSearch> {
	const search: oDataSearchModel = {
		search: "",
		filter,
		orderby: "release desc",
		skip: "0",
		top: 1,
		count: true
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
		return { status: response.status, count: 0 };
	}
	const json = await response.json<{ "@odata.count"?: number; value?: Record<string, unknown>[] }>();
	const latest = json.value?.[0];
	const count = typeof json["@odata.count"] === "number" ? json["@odata.count"] : json.value?.length ?? 0;
	return { status: 200, count, latest };
}

export function hubPageDetails(
	hub: CatalogueHub,
	name: string,
	count: number,
	requestUrl: string,
	latest?: Record<string, unknown>
): IPageDetails {
	const noun = count === 1 ? hubItemNoun[hub] : `${hubItemNoun[hub]}s`;
	const details: IPageDetails = {
		title: name,
		description: `${name} has ${count} ${noun} found by CultPodcasts.com`
	};
	const art = latest ? resolveShareImageAbsoluteUrl(latest as SearchEpisodeImageFields) : undefined;
	if (art && latest) {
		const aspect = resolveShareImageAspect(art, latest as SearchEpisodeImageFields);
		details.image = buildBrandedOgImageUrl(requestUrl, art, aspect, { title: name });
		details.imageAspect = aspect;
	}
	return details;
}

/**
 * Page details for a news outlet / TV show hub. Read-only: no shortener KV record (hubs have no
 * short id). 400 "No item found" when the hub has no items, matching the episode path.
 */
export async function getHubPageDetails(
	c: ActionContext,
	logCollector: LogCollector,
	target: { hub: CatalogueHub; name: string }
): Promise<Response> {
	const [seriesFilter, legacyFilter] = hubPageDetailsFilters(target.hub, target.name);
	let result = await searchHub(c, seriesFilter);
	if (result.status !== 200) {
		result = await searchHub(c, legacyFilter);
	}
	if (result.status !== 200) {
		logCollector.add({ status: result.status });
		logCollector.addMessage(`Search-api responded with status '${result.status}'`);
		logCollector.emitError({ event: "page_details.hub_search_upstream_error", outcome: "error" });
		return c.text(logCollector.message ?? "Search-api error", 400);
	}
	if (!result.latest || result.count === 0) {
		logCollector.addMessage(`No item for ${target.hub} hub '${target.name}'`);
		logCollector.emitError({ event: "page_details.hub_search_empty", outcome: "error" });
		return c.text(logCollector.message ?? "No item found", 400);
	}
	logCollector.emit({ event: "page_details.hub_hit", outcome: "success" });
	return c.json(hubPageDetails(target.hub, target.name, result.count, c.req.url, result.latest));
}
