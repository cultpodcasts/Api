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
	 * Search platform Worker (service binding, SP-1.3): `search` on api, `search-preview` on
	 * api-preview, `search-local` locally (`npm run search:dev`; wrangler.search.jsonc env.local has
	 * no name, so wrangler registers `search-local`). Serves `POST /indexes/{index}/docs/search` over D1.
	 * Azure AI Search remains the served `/search` result until cutover (SP-4.x). When
	 * `searchShadowEnabled` is on, a sampled fraction of those requests also query this binding
	 * on `waitUntil` and log a `search shadow` comparison (SP-3.1).
	 */
	SEARCH?: Fetcher;
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
	 * SP-3.1 shadow-query kill switch (`"true"` / `"false"`). Default off (safe) until
	 * explicitly enabled. Sample rate and top-N stay in the other `searchShadow*` vars.
	 */
	searchShadowEnabled?: string;
	/** Fraction of `/search` requests to also send to the D1 search Worker (0–1). Default `0.01`. */
	searchShadowSampleRate?: string;
	/** Leading hit ids compared between Azure and D1. Default `10`. */
	searchShadowTopN?: string;
	PROFILE_DURABLE_OBJECT: DurableObjectNamespace<import("./ProfileDurableObject").ProfileDurableObject>;
	HERO_CURATION_DURABLE_OBJECT: DurableObjectNamespace<import("./HeroCurationDurableObject").HeroCurationDurableObject>;
	DISCOVERY_CURATION_DURABLE_OBJECT: DurableObjectNamespace<
		import("./DiscoveryCurationDurableObject").DiscoveryCurationDurableObject
	>;
	Content: R2Bucket;
	Data: R2Bucket;
	apiDB: D1Database;
	Analytics: AnalyticsEngineDataset;
	overrideHost: string | undefined | null;
};
