/**
 * Azure-shaped document and envelope for `POST /indexes/{index}/docs/search` (SP-0.2, SP-1.9).
 *
 * Ported from the `search-demo/` prototype and mapped onto the SP-1.1 schema
 * (`migrations/0001_search_schema.sql`), which carries every retrievable field the live Azure
 * index has: full descriptions, `alternative_titles`, trailers, internet archive and the six
 * identity ids. Hidden fields (`publisher_search_terms`, `episode_search_terms`) and `guests`
 * are searchable but not retrievable, as in Azure, so they are never returned.
 * Legacy `podcastName` is not on the live index and is not returned.
 */

/** Columns the route selects from `search_docs` (alias `d`). */
export const DOC_COLUMNS = [
	"rowid",
	"id",
	"kind",
	"title",
	"series_name",
	"description",
	"release",
	"duration",
	"spotify_id",
	"apple_id",
	"podcast_apple_id",
	"youtube_id",
	"bbc",
	"internet_archive",
	"svc",
	"image",
	"trailers",
	"alternative_titles",
	"imdb_id",
	"tmdb_id",
	"tvdb_id",
	"series_imdb_id",
	"series_tmdb_id",
	"series_tvdb_id",
	"lang"
] as const;

export type AzureSearchDocRow = {
	rowid: number;
	id: string;
	kind: string;
	title: string | null;
	series_name: string | null;
	description: string | null;
	/** ISO-8601 UTC with a trailing Z and no milliseconds, as Azure returns it. */
	release: string;
	duration: string;
	spotify_id: string | null;
	apple_id: string | null;
	podcast_apple_id: string | null;
	youtube_id: string | null;
	bbc: string;
	internet_archive: string;
	svc: string;
	image: string | null;
	/** JSON array of "{duration}|{url}|{title}" tokens. */
	trailers: string | null;
	/** Newline-separated. */
	alternative_titles: string | null;
	imdb_id: string | null;
	tmdb_id: number | null;
	tvdb_id: number | null;
	series_imdb_id: string | null;
	series_tmdb_id: number | null;
	series_tvdb_id: number | null;
	lang: string | null;
};

/**
 * Retrievable keys on the live Azure index, in `EpisodeSearchRecord` / FieldBuilder order
 * (RPP main, after #1431 and #1437). `publisherSearchTerms` and `episodeSearchTerms` are
 * hidden and are not returned. Legacy `podcastName` / `episodeTitle` / `episodeDescription`
 * are FieldBuilderIgnore and are not on the live index.
 */
export const LIVE_AZURE_RETRIEVABLE_KEYS = [
	"id",
	"contentKind",
	"title",
	"seriesName",
	"description",
	"release",
	"duration",
	"spotifyId",
	"appleId",
	"podcastAppleId",
	"youtubeId",
	"bbc",
	"internetArchive",
	"svc",
	"subjects",
	"image",
	"trailers",
	"alternativeTitles",
	"imdbId",
	"tmdbId",
	"tvdbId",
	"seriesImdbId",
	"seriesTmdbId",
	"seriesTvdbId",
	"lang"
] as const;

/** Newline-separated column -> Azure Collection(Edm.String); null when empty, like an unset Azure field. */
export function splitLines(value: string | null): string[] | null {
	if (!value) return null;
	const items = value.split("\n").map((s) => s.trim()).filter(Boolean);
	return items.length ? items : null;
}

/** JSON array column -> string[]; null when unset or unreadable (never fails the whole search). */
export function parseStringArray(value: string | null): string[] | null {
	if (!value) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) && parsed.every((t) => typeof t === "string") && parsed.length ? parsed : null;
	} catch {
		return null;
	}
}

/** One search hit with the live Azure document keys, in Azure's order. */
export function toAzureSearchDocument(d: AzureSearchDocRow, score: number, subjects: string[]): Record<string, unknown> {
	return {
		"@search.score": score,
		id: d.id,
		contentKind: d.kind, // pragma: allowlist secret
		title: d.title,
		seriesName: d.series_name,
		description: d.description,
		release: d.release,
		duration: d.duration,
		spotifyId: d.spotify_id,
		appleId: d.apple_id,
		podcastAppleId: d.podcast_apple_id,
		youtubeId: d.youtube_id,
		bbc: d.bbc,
		internetArchive: d.internet_archive,
		svc: d.svc,
		subjects, // pragma: allowlist secret
		image: d.image,
		trailers: parseStringArray(d.trailers),
		alternativeTitles: splitLines(d.alternative_titles),
		imdbId: d.imdb_id,
		tmdbId: d.tmdb_id,
		tvdbId: d.tvdb_id,
		seriesImdbId: d.series_imdb_id,
		seriesTmdbId: d.series_tmdb_id,
		seriesTvdbId: d.series_tvdb_id,
		lang: d.lang
	};
}

/** Envelope the api Worker returns after stripping Azure's @odata.context to null. */
export function toAzureSearchEnvelope(
	documents: Record<string, unknown>[],
	options: { count?: number; facets?: Record<string, unknown> } = {}
): Record<string, unknown> {
	const body: Record<string, unknown> = {
		"@odata.context": null,
		value: documents
	};
	if (options.count !== undefined) body["@odata.count"] = options.count;
	if (options.facets) body["@search.facets"] = options.facets;
	return body;
}
