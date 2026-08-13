import { EpisodeShareImageAspect } from "./episodeShareImage";

export interface ShortnerRecord {
    episodeTitle?: string;
    releaseDate?: string;
    duration?: string;
    /**
     * Search-index image encoding (y{q} / s{id} / a{n}{path} / full URL).
     * Expanded to an absolute URL when serving page-details.
     */
    image?: string;
    /** Required to expand YouTube y{q} tokens. */
    youtubeId?: string;
    /** YouTube / BBC iPlayer / Internet Archive → wide; Spotify/Apple/BBC Sounds → square. */
    imageAspect?: EpisodeShareImageAspect;
    /** Comma-separated platforms for OG card chips (new KV writes only; never rewrite existing). */
    platforms?: string;
}
