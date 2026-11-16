/**
 * Azure-shaped document/envelope helpers for the search-demo docs/search endpoint (SP-0.2).
 * D1 stores release as unix seconds, so Date#toISOString() always ends in .000Z; Azure emits …Z.
 * podcastName is not on the live Azure index (it 400s filters that use it).
 */

export interface AzureSearchDocRow {
  id: string;
  kind: string;
  title: string;
  series_name: string | null;
  description: string | null;
  release: number;
  duration: string;
  lang: string | null;
  spotify_id: string | null;
  youtube_id: string | null;
  apple_id: string | null;
  podcast_apple_id: string | null;
  image: string;
  svc: string;
  bbc: string;
}

/**
 * Retrievable keys on the live Azure index, in `EpisodeSearchRecord` / FieldBuilder order
 * (main, after RPP #1431 and #1437). `publisherSearchTerms` and `episodeSearchTerms` are
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

/** Format a unix-seconds release the way Azure AI Search (and the api Worker) return it. */
export function formatAzureRelease(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(/\.000Z$/, "Z");
}

/** Compact search record matching the live Azure index document keys. No extra podcastName. */
export function toAzureSearchDocument(
  d: AzureSearchDocRow,
  score: number,
  subjects: string[]
): Record<string, unknown> {
  return {
    "@search.score": score,
    id: d.id,
    contentKind: d.kind, // pragma: allowlist secret
    title: d.title,
    seriesName: d.series_name,
    description: d.description,
    release: formatAzureRelease(d.release),
    duration: d.duration,
    spotifyId: d.spotify_id,
    appleId: d.apple_id,
    podcastAppleId: d.podcast_apple_id,
    youtubeId: d.youtube_id,
    bbc: d.bbc,
    // TODO(G1 / Api #225, identity-ids): the demo D1 schema has no columns yet for
    // internetArchive, trailers, alternativeTitles (RPP #1431), or the six identity
    // ids (RPP #1437). Azure returns these retrievable fields as null when unset;
    // emit null until the corpus carries them.
    internetArchive: null,
    svc: d.svc,
    subjects, // pragma: allowlist secret
    image: d.image,
    trailers: null,
    alternativeTitles: null,
    imdbId: null,
    tmdbId: null,
    tvdbId: null,
    seriesImdbId: null,
    seriesTmdbId: null,
    seriesTvdbId: null,
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
