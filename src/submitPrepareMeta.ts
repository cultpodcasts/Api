/** KV cache for streaming prepare meta (Worker injects on submit). */

export const STREAM_META_TTL_SECONDS = 15 * 60;

export type PrefetchedMeta = {
	title: string;
	description: string;
	duration?: string | null;
	release?: string | null;
	image?: string | null;
	explicit?: boolean | null;
	publisher?: string | null;
	showName?: string | null;
	/** Standalone film (e.g. JSON-LD Movie). Azure's classifier files the URL as a Film when true. */
	madeAsFilm?: boolean | null;
};

export type StreamMetaCacheEntry = PrefetchedMeta & {
	service: string;
	podcastName?: string | null;
};

/**
 * v2 (contract v2): entries carry `madeAsFilm`. Bumped from v1 so pre-fix entries without the
 * flag are never injected as prefetchedMeta (Azure would bind MadeAsFilm=false → podcast episode).
 */
export const STREAM_META_KV_PREFIX = "stream-meta:v2:";

export function streamMetaKvKey(url: string): string {
	return `${STREAM_META_KV_PREFIX}${url}`;
}

export async function getStreamMeta(
	kv: KVNamespace,
	url: string
): Promise<StreamMetaCacheEntry | null> {
	return kv.get(streamMetaKvKey(url), "json");
}

export async function putStreamMeta(
	kv: KVNamespace,
	url: string,
	entry: StreamMetaCacheEntry
): Promise<void> {
	await kv.put(streamMetaKvKey(url), JSON.stringify(entry), {
		expirationTtl: STREAM_META_TTL_SECONDS
	});
}

export function parseBrowserRenderingServicesCsv(csv: string | undefined | null): string[] {
	if (!csv?.trim()) {
		return [];
	}
	return csv
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export function toPrefetchedMeta(entry: StreamMetaCacheEntry): PrefetchedMeta {
	return {
		title: entry.title,
		description: entry.description,
		duration: entry.duration,
		release: entry.release,
		image: entry.image,
		explicit: entry.explicit,
		publisher: entry.publisher,
		showName: entry.showName,
		madeAsFilm: entry.madeAsFilm
	};
}
