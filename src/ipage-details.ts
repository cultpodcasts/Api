import { EpisodeShareImageAspect } from "./episodeShareImage";

export interface IPageDetails {
    title?: string,
    description?: string,
    releaseDate?: string,
    duration?: string,
    /** Absolute HTTPS URL for og:image / twitter:image — Api `/og-image` (logo overlay) when share art exists. */
    image?: string,
    /** YouTube / BBC iPlayer / Internet Archive → wide; Spotify/Apple/BBC Sounds → square. */
    imageAspect?: EpisodeShareImageAspect
}
