/** OData filters for one playable. Try seriesName first; podcastName is the live index. */
export function playableLookupFilters(name: string, id: string): readonly [string, string] {
	const escaped = name.replaceAll("'", "''");
	return [
		`(seriesName eq '${escaped}') and (id eq '${id}')`,
		`(podcastName eq '${escaped}') and (id eq '${id}')`
	];
}

export function playableCardTitle(episode: Record<string, unknown>): string {
	const title = episode["title"];
	if (typeof title === "string" && title.length > 0) {
		return title;
	}
	const legacy = episode["episodeTitle"];
	return typeof legacy === "string" ? legacy : "";
}
