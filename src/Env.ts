export type Env = {
	shortner: KVNamespace;
	Curated: KVNamespace;
	auth0Issuer: string;
	auth0Audience: string;
	auth0ClientId: string;
	apihost: string;
	apikey: string;
	secureSubmitEndpoint: URL;
	secureEpisodeEndpoint: URL;
	securePublicEpisodeEndpoint: URL;
	secureEpisodePublishEndpoint: URL;
	secureDiscoveryCurationEndpoint: URL;
	securePodcastIndexEndpoint: URL;
	securePodcastEndpoint: URL;
	secureSubjectEndpoint: URL;
	securePeopleEndpoint: URL;
	secureEpisodesOutgoingEndpoint: URL;
	secureAdminSearchIndexerEndpoint: URL;
	secureAdminPublishHomepageEndpoint: URL;
	secureDiscoveryScheduleEndpoint: URL;
	secureSupportedLanguagesEndpoint: URL;
	secureTitleCasingRulesEndpoint: URL;
	securePushSubscriptionEndpoint: URL;
	stagingHostSuffix: string;
	/** Non-secret: production | preview | local — drives OpenAPI docs title. */
	apiEnvironment?: string;
	PROFILE_DURABLE_OBJECT: DurableObjectNamespace<import("./ProfileDurableObject").ProfileDurableObject>;
	HERO_CURATION_DURABLE_OBJECT: DurableObjectNamespace<import("./HeroCurationDurableObject").HeroCurationDurableObject>;
	Content: R2Bucket;
	Data: R2Bucket;
	apiDB: D1Database;
	Analytics: AnalyticsEngineDataset;
	overrideHost: string | undefined | null;
	/** Cloudflare Images binding (optional; OG card no longer requires it). */
	IMAGES?: ImageBinding;
};

/** Minimal Images binding surface used by /og-image. */
export interface ImageBinding {
	input(
		stream: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array
	): ImageTransformer;
}

export interface ImageTransformer {
	transform(options: Record<string, unknown>): ImageTransformer;
	draw(
		image: ImageTransformer | ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array,
		options?: Record<string, unknown>
	): ImageTransformer;
	output(options: Record<string, unknown>): Promise<{ response(): Response }>;
}
