// pragma: allowlist secret
/** Inverse of RPP SearchEpisodeServices compact `svc` field. */ // pragma: allowlist secret
export function expandSearchServices(svc: string | undefined | null): { key: string; url: string }[] {
	if (!svc) {
		return [];
	}
	const expanders: Record<string, (id: string) => string> = {
		bbcSounds: (id) => `https://www.bbc.co.uk/sounds/play/${id}`,
		bbcIplayer: (id) => `https://www.bbc.co.uk/iplayer/episode/${id}`,
		internetArchive: (id) => `https://archive.org/details/${id}`,
		vimeo: (id) => `https://vimeo.com/${id}`,
		netflix: (id) => `https://www.netflix.com/title/${id}`,
		bitchute: (id) => `https://www.bitchute.com/video/${id}`
	};
	const out: { key: string; url: string }[] = [];
	for (const entry of svc.split("|")) {
		const colon = entry.indexOf(":");
		if (colon <= 0 || colon === entry.length - 1) {
			continue;
		}
		const key = entry.slice(0, colon);
		let payload = entry.slice(colon + 1).replaceAll("%7C", "|").replaceAll("%25", "%");
		if (payload.startsWith("u") && payload.slice(1).startsWith("http")) {
			payload = payload.slice(1);
		}
		const url = payload.startsWith("http") ? payload : expanders[key]?.(payload);
		if (url) {
			out.push({ key, url });
		}
	}
	return out;
}
