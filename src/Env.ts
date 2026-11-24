import type { BrowserWorker } from "@cloudflare/puppeteer";

export type Env = {
	shortner: KVNamespace;
	Curated: KVNamespace;
	/** Streaming prepare meta cache (`stream-meta:v2:<url>`). */
	StreamMeta: KVNamespace;
	/** Cloudflare Browser Rendering binding for prepare HTML fetch. */
	BROWSER?: BrowserWorker;
	/**
	 * US-placed scrape Worker (service binding). Used when scrapeProfiles.region === "us".
	 */
	SCRAPE_US?: Fetcher;
	/**
	 * Production D1 search Worker (service binding, SP-1.3): Worker `search`
	 * (`cultpodcasts-search`). Locally this is `search-local`. Serves
	 * `POST /indexes/{index}/docs/search` over D1. The served `/search` engine is
	 * `searchPrimaryEngine` (Azure by default). When primary is Azure and
	 * `searchShadowEnabled` is on, a sampled fraction also query this binding (or
	 * `SEARCH_PREVIEW` if `searchD1Index` is preview) on `waitUntil` (SP-3.1).
	 */
	SEARCH?: Fetcher;
	/**
	 * Preview D1 search Worker (`search-preview` / `cultpodcasts-search-preview`). Bound on
	 * api-preview only (SP-4.1). Used when `searchD1Index` is `preview`.
	 */
	SEARCH_PREVIEW?: Fetcher;
	auth0Issuer: string;
	auth0Audience: string;
	auth0ClientId: string;
	apihost: string;
	apikey: string;
	/** Azure Functions origin only (`https://api-infra.azurewebsites.net`). Paths live in `AzureResourcePaths`. */
	azureApiOrigin: string;
	stagingHostSuffix: string;
	/**
	 * CSV of streaming ServiceKeys that use CF Browser Rendering on prepare (e.g. `itvx`).
	 * Legacy overlay on contract scrapeProfiles; empty = contract defaults / profiles only.
	 * Secret (not wrangler vars).
	 */
	browserRenderingServices?: string;
	/** Non-secret: production | preview | local — drives OpenAPI docs title. */
	apiEnvironment?: string;
	/**
	 * SP-4.1 served-engine switch (`azure` / `d1`, enum SearchPrimaryEngine). Default azure.
	 * Preview wrangler sets `d1`; production stays azure until SP-4.2.
	 */
	searchPrimaryEngine?: string;
	/**
	 * Which D1 Worker to use when D1 is the primary engine or the shadow target
	 * (`production` / `preview`, enum SearchD1Index). Default production.
	 */
	searchD1Index?: string;
	/**
	 * SP-3.1 shadow-query kill switch (`"true"` / `"false"`). Default off (safe) until
	 * explicitly enabled. Sample rate and top-N stay in the other `searchShadow*` vars.
	 * Shadow is skipped when `searchPrimaryEngine` is d1 (do not shadow D1 against itself).
	 */
	searchShadowEnabled?: string;
	/** Fraction of `/search` requests to also send to the D1 search Worker (0–1). Default `0.01`. */
	searchShadowSampleRate?: string;
	/** Leading hit ids compared between Azure and D1. Default `10`. */
	searchShadowTopN?: string;
	/** Abort the shadow D1 call after this many ms (100–30000); a timeout logs as `d1Unavailable`. Default `3000`. */
	searchShadowTimeoutMs?: string;
	PROFILE_DURABLE_OBJECT: DurableObjectNamespace<import("./ProfileDurableObject").ProfileDurableObject>;
	HERO_CURATION_DURABLE_OBJECT: DurableObjectNamespace<import("./HeroCurationDurableObject").HeroCurationDurableObject>;
	DISCOVERY_CURATION_DURABLE_OBJECT: DurableObjectNamespace<
		import("./DiscoveryCurationDurableObject").DiscoveryCurationDurableObject
	>;
	Content: R2Bucket;
	Data: R2Bucket;
	apiDB: D1Database;
	Analytics: AnalyticsEngineDataset;
	/**
	 * Search shadow soak samples (cultpodcasts/Api#304): one data point per `search shadow` sample,
	 * read back by `/docs/search-shadow-soak`. Dataset per environment (`searchShadowAnalyticsDataset`).
	 */
	SearchShadowAnalytics?: AnalyticsEngineDataset;
	/** Non-secret: the Analytics Engine dataset name behind `SearchShadowAnalytics` (for the SQL API). */
	searchShadowAnalyticsDataset?: string;
	/** Non-secret: Cloudflare account id for the Analytics Engine SQL API. */
	cloudflareAccountId?: string;
	/** Secret: Cloudflare account API token with only `Account Analytics: Read` (soak page). */
	cfAnalyticsReadToken?: string;
	overrideHost: string | undefined | null;
};
