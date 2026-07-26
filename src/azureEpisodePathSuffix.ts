/**
 * Build the Azure Functions path suffix for an episode lookup by podcast name.
 *
 * Azure (and most hosts) decode `%2F` before routing, so a podcast name that
 * contains `/` (e.g. "The FOX True Crime Podcast w/ Emily Compagno") cannot be
 * placed in a single path segment — the request 404s. Fall back to the
 * episode-id-only route in that case.
 */
export function azureEpisodePathSuffix(podcastName: string, episodeId: string): string {
	if (podcastName.includes("/")) {
		return `/${encodeURIComponent(episodeId)}`;
	}
	return `/${encodeURIComponent(podcastName)}/${encodeURIComponent(episodeId)}`;
}
