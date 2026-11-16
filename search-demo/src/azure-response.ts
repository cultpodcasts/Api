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
    lang: d.lang,
    spotifyId: d.spotify_id,
    appleId: d.apple_id,
    podcastAppleId: d.podcast_apple_id,
    youtubeId: d.youtube_id,
    image: d.image,
    svc: d.svc,
    bbc: d.bbc,
    // Not carried in the demo corpus; present for shape parity with the Azure index.
    internetArchive: null,
    trailers: null,
    subjects, // pragma: allowlist secret
  };
}

/** Envelope the api Worker returns after stripping Azure's @odata.context to null. */
export function toAzureSearchEnvelope(
  documents: Record<string, unknown>[],
  options: { count?: number; facets?: Record<string, unknown> } = {}
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    "@odata.context": null,
    value: documents,
  };
  if (options.count !== undefined) body["@odata.count"] = options.count;
  if (options.facets) body["@search.facets"] = options.facets;
  return body;
}
