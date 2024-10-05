export type Env = {
	Content: R2Bucket;
	Data: R2Bucket;
	Analytics: AnalyticsEngineDataset;
	apiDB: D1Database;
	apikey: string;
	apihost: string;
	gatewayKey: string;
	auth0Issuer: string;
	auth0Audience: string;
	secureSubmitEndpoint: URL;
	secureEpisodeEndpoint: URL;
	secureDiscoveryCurationEndpoint: URL;
	securePodcastIndexEndpoint: URL;
	securePodcastEndpoint: URL;
	secureSubjectEndpoint: URL;
	secureEpisodesOutgoingEndpoint: URL;
	secureEpisodePublishEndpoint: URL;
	secureAdminSearchIndexerEndpoint: URL;
	secureAdminPublishHomepageEndpoint: URL;
	stagingHostSuffix: string;
};
