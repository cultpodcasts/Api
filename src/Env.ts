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
	overrideHost: string | undefined | null
};
