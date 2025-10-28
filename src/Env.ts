export type Env = {
	shortner: KVNamespace;
	auth0Issuer: string;
	auth0Audience: string;
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
	secureEpisodesOutgoingEndpoint: URL;
	secureAdminSearchIndexerEndpoint: URL;
	secureAdminPublishHomepageEndpoint: URL;
	secureAdminTermsEndpoint: URL;
	securePushSubscriptionEndpoint: URL;
	stagingHostSuffix: string;
	PROFILE_DURABLE_OBJECT: DurableObjectNamespace<import("./ProfileDurableObject").ProfileDurableObject>;
	Content: R2Bucket;
	Data: R2Bucket;
	apiDB: D1Database;
	Analytics: AnalyticsEngineDataset;
	overrideHost: string | undefined | null
};
