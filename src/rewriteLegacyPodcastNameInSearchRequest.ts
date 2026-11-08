import type { oDataSearchModel } from "./oDataSearchModel";

/**
 * Stale clients still send Azure Search field `podcastName` after the index
 * rename to `seriesName` (cultpodcasts/Api#216). Rewrite request-side OData
 * identifiers only — not hit payloads.
 */
const LEGACY_PODCAST_NAME = /\bpodcastName\b/g;

function rewriteIdentifiers(value: string): string {
	return value.replace(LEGACY_PODCAST_NAME, "seriesName");
}

export function rewriteLegacyPodcastNameInSearchRequest(data: oDataSearchModel): void {
	if (typeof data.filter === "string") {
		data.filter = rewriteIdentifiers(data.filter);
	}
	if (typeof data.orderby === "string") {
		data.orderby = rewriteIdentifiers(data.orderby);
	}
	if (typeof data.select === "string") {
		data.select = rewriteIdentifiers(data.select);
	}
	if (typeof data.facets === "string") {
		data.facets = rewriteIdentifiers(data.facets);
	} else if (Array.isArray(data.facets)) {
		data.facets = data.facets.map((facet) =>
			typeof facet === "string" ? rewriteIdentifiers(facet) : facet
		);
	}
}
