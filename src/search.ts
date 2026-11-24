import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { searchLogCollector } from "./searchLogCollector";
import { oDataSearchModel } from "./oDataSearchModel";
import { boostUnquotedPhraseInSearchRequest } from "./boostUnquotedPhrase";
import { rewriteLegacyPodcastNameInSearchRequest } from "./rewriteLegacyPodcastNameInSearchRequest";
import { searchMode } from "./searchMode";
import {
	executionCtxOf,
	parseSearchShadowConfig,
	runSearchShadow,
	scheduleSearchShadow,
	searchShadowUrl,
	shouldSampleShadow,
	snapshotSearchResponse,
	type SearchEngineSnapshot
} from "./searchShadow";
import {
	SearchPrimaryEngine,
	d1PrimaryIsUnavailable,
	d1SearchFetcher,
	fetchD1Search,
	parseSearchPrimaryConfig
} from "./searchEngine";

/** Forward Azure AI Search error statuses: keep 4xx/5xx (incl. 429); other non-200 → 502. */
export function upstreamSearchErrorStatus(status: number): ContentfulStatusCode {
	if (status >= 400 && status <= 599) {
		return status as ContentfulStatusCode;
	}
	return 502;
}

/** Most of a non-JSON upstream error body kept in the search log (never sent to the client). */
export const UPSTREAM_ERROR_LOG_LIMIT = 500;

const GENERIC_UPSTREAM_ERROR = { error: "Upstream search error" } as const;

/**
 * Body to forward for an upstream (Azure AI Search) error. A JSON envelope is forwarded
 * unchanged, because the website reads field names from Azure's messages. Anything else (an
 * HTML gateway page, plaintext) is replaced by a generic body so it never reaches the browser;
 * `onUnparsed` receives the raw text, cut to {@link UPSTREAM_ERROR_LOG_LIMIT}, for the log.
 */
export async function parseUpstreamSearchErrorBody(
	response: Response,
	onUnparsed?: (raw: string) => void
): Promise<object> {
	let raw: string;
	try {
		raw = await response.text();
	} catch {
		return GENERIC_UPSTREAM_ERROR;
	}
	if (!raw) {
		return GENERIC_UPSTREAM_ERROR;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (parsed !== null && typeof parsed === "object") {
			return parsed as object;
		}
	} catch {
		// fall through: not JSON
	}
	onUnparsed?.(raw.slice(0, UPSTREAM_ERROR_LOG_LIMIT));
	return GENERIC_UPSTREAM_ERROR;
}

/** Upstream headers worth forwarding on an error: how long a retryable 429/503 should wait. */
const FORWARDED_UPSTREAM_ERROR_HEADERS = ["retry-after"] as const;

function forwardUpstreamErrorHeaders(c: ActionContext, response: Response): void {
	for (const name of FORWARDED_UPSTREAM_ERROR_HEADERS) {
		const value = response.headers.get(name);
		if (value) {
			c.header(name, value);
		}
	}
}

/**
 * Every non-200 `POST /search` response goes through here, so each one carries the CORS headers
 * the cross-origin website needs to read it. The envelopes (also in the OpenAPI spec,
 * `SearchRoute` in openapiRoutes.ts):
 *
 * | Status | Body | When |
 * | --- | --- | --- |
 * | 400 | `{ error: "Bad request" }` | Request body is not JSON the Worker can rewrite. Legacy shape kept for the website. |
 * | 4xx/5xx (incl. 429, 503) | Azure's JSON envelope, else `{ error: "Upstream search error" }` | Upstream error, status forwarded with `Retry-After`. |
 * | 502 | `{ error: { code: "UpstreamSearchError", message } }` | Upstream unreachable, unexpected status or unreadable 200 body. |
 */
function searchError(c: ActionContext, status: ContentfulStatusCode, body: object): Response {
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	return c.json(body, status);
}

/**
 * Upstream unreachable (fetch threw) or returned an unreadable success body. Bad gateway, not
 * the client's fault: never a 400, which the website treats as a request/field error.
 */
function badGateway(c: ActionContext, searchLog: searchLogCollector, message: string): Response {
	searchLog.addMessage("upstream_error");
	searchLog.emitError({ message: `search upstream error: ${message}` });
	return searchError(c, 502, { error: { code: "UpstreamSearchError", message: "Upstream search unavailable" } });
}

type ShadowRequest = {
	requestBody: string;
	query?: string;
	filter?: string;
	requestId?: string;
};

/**
 * If the soak sampler is on and this request is in the sample, query the D1 search Worker
 * via the selected D1 binding after the Azure response is already on its way. `waitUntil` keeps
 * that work off the user-visible path (SP-3.1, #228). Skipped when primary is D1 so
 * we do not shadow D1 against itself (SP-4.1).
 */
function maybeScheduleSearchShadow(
	c: ActionContext,
	request: ShadowRequest,
	azureStarted: number,
	azureStatus: number | undefined,
	azureBody: unknown,
	azureError?: string,
	azureCacheStatus?: string | null
): void {
	if (parseSearchPrimaryConfig(c.env).engine === SearchPrimaryEngine.D1) return;
	const fetcher = d1SearchFetcher(c.env);
	if (!fetcher) return;
	const config = parseSearchShadowConfig(c.env);
	if (!shouldSampleShadow(config)) return;
	const azure: SearchEngineSnapshot = snapshotSearchResponse(
		azureStatus,
		Date.now() - azureStarted,
		azureBody,
		config.topN,
		azureError
	);
	if (azureCacheStatus) azure.cacheStatus = azureCacheStatus;
	scheduleSearchShadow(
		executionCtxOf(c),
		runSearchShadow({
			fetcher,
			url: searchShadowUrl(c.env.apihost),
			requestBody: request.requestBody,
			azure,
			topN: config.topN,
			timeoutMs: config.timeoutMs,
			requestId: request.requestId,
			query: request.query,
			filter: request.filter,
			analytics: c.env.SearchShadowAnalytics
		})
	);
}

export async function search(c: ActionContext): Promise<Response> {
	const leechHandlingActive: boolean = false;
	let searchLog = new searchLogCollector();
	searchLog.collectRequest(c);
	let isLeech: boolean = await evalIsLeech(leechHandlingActive, c.env.Data, c.req.header('cf-connecting-ip'));
	if (isLeech) {
		return createLeachResponse(c, searchLog);
	}

	// Only a bad request body is the client's fault (400): invalid JSON, or JSON the request
	// rewriters cannot handle. Upstream failures below keep their own status and are never
	// reported as 400 (SP-1.5, cultpodcasts/Api#223).
	let requestBody: string;
	let shadowQuery: string | undefined;
	let shadowFilter: string | undefined;
	try {
		const data: oDataSearchModel = await c.req.json();
		// Collect inbound body first so logs still see legacy podcastName
		// (stale-client signal + podcast-mode filter detection).
		searchLog.collectSearchRequest(data);
		// Log the inbound query (same text searchLog already records), not the rewritten body.
		shadowQuery = data.search;
		shadowFilter = data.filter;
		rewriteLegacyPodcastNameInSearchRequest(data);
		boostUnquotedPhraseInSearchRequest(data);
		requestBody = JSON.stringify(data);
	} catch {
		searchLog.addMessage("bad_json");
		searchLog.emitError({ message: "search bad_json error" });
		return searchError(c, 400, { error: "Bad request" });
	}

	const shadowRequest: ShadowRequest = {
		requestBody,
		query: shadowQuery,
		filter: shadowFilter,
		requestId: searchLog.requestId
	};
	const azureStarted = Date.now();
	if (parseSearchPrimaryConfig(c.env).engine === SearchPrimaryEngine.D1) {
		const d1Response = await tryServeD1Primary(c, searchLog, requestBody);
		if (d1Response) return d1Response;
	}
	let response: Response;
	try {
		response = await fetch(c.env.apihost, {
			cf: {
				// JSON search responses need cacheEverything; TTL by status so 429/5xx are not sticky for 600s
				cacheEverything: true,
				cacheTtlByStatus: {
					"200-299": 600,
					"400-599": 0
				}
			},
			headers: {
				"api-key": c.env.apikey,
				"content-type": "application/json;charset=UTF-8",
			},
			body: requestBody,
			method: "POST"
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		maybeScheduleSearchShadow(c, shadowRequest, azureStarted, undefined, undefined, message);
		return badGateway(c, searchLog, message);
	}

	searchLog.add({ searchStatus: response.status });
	if (response.status != 200) {
		let unparsed: string | undefined;
		const errorBody = await parseUpstreamSearchErrorBody(response, (raw) => { unparsed = raw; });
		searchLog.emitError(
			unparsed === undefined ? undefined : { message: `search upstream non-JSON error body: ${unparsed}` }
		);
		forwardUpstreamErrorHeaders(c, response);
		maybeScheduleSearchShadow(c, shadowRequest, azureStarted, response.status, errorBody);
		return searchError(c, upstreamSearchErrorStatus(response.status), errorBody);
	}

	let body: any;
	try {
		body = await response.json();
	} catch (e) {
		const message = `unreadable 200 body: ${e instanceof Error ? e.message : String(e)}`;
		maybeScheduleSearchShadow(c, shadowRequest, azureStarted, 200, undefined, message);
		return badGateway(c, searchLog, message);
	}
	if (body === null || typeof body !== "object" || Array.isArray(body)) {
		maybeScheduleSearchShadow(c, shadowRequest, azureStarted, 200, body, "non-object 200 body");
		return badGateway(c, searchLog, "non-object 200 body");
	}
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	body["@odata.context"] = null;
	// Azure is the served engine today. When cutover forwards the D1 worker body, that
	// envelope already carries @search.engine "d1" — keep it.
	if (body["@search.engine"] !== "d1") {
		body["@search.engine"] = "azure";
	}
	maybeScheduleSearchShadow(c, shadowRequest, azureStarted, 200, body, undefined, response.headers.get("cf-cache-status"));
	if (searchLog.error) {
		searchLog.emitError();
	} else {
		if ((searchLog.mode == searchMode.shortnerFallback ||
			searchLog.mode == searchMode.episode) &&
			body.value?.length == 1) {
			searchLog.add({ searchResult: body.value[0] });
		} else {
			searchLog.add({ results: body.value?.length });
		}
		searchLog.emit();
	}
	return c.json(body, 200);
}


/**
 * When searchPrimaryEngine is d1, try the selected D1 Worker first. Returns a Response
 * to send as-is (success or a D1 4xx). Returns null to fall back to Azure (unavailable D1:
 * timeout, missing binding, 429/5xx, unreadable body).
 */
async function tryServeD1Primary(
	c: ActionContext,
	searchLog: searchLogCollector,
	requestBody: string
): Promise<Response | null> {
	const { index } = parseSearchPrimaryConfig(c.env);
	const fetcher = d1SearchFetcher(c.env);
	const timeoutMs = parseSearchShadowConfig(c.env).timeoutMs;
	if (!fetcher) {
		console.warn({ message: "search d1 primary fallback", error: "missing_binding", index });
		return null;
	}
	const result = await fetchD1Search({
		fetcher,
		url: searchShadowUrl(c.env.apihost),
		requestBody,
		timeoutMs
	});
	if (result.ok) {
		const body = result.body;
		AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
		body["@odata.context"] = null;
		body["@search.engine"] = "d1";
		searchLog.add({ searchStatus: result.status });
		if (searchLog.error) {
			searchLog.emitError();
		} else if (
			(searchLog.mode == searchMode.shortnerFallback || searchLog.mode == searchMode.episode) &&
			Array.isArray(body.value) &&
			body.value.length == 1
		) {
			searchLog.add({ searchResult: body.value[0] });
			searchLog.emit();
		} else {
			searchLog.add({ results: Array.isArray(body.value) ? body.value.length : undefined });
			searchLog.emit();
		}
		return c.json(body, 200);
	}
	if (d1PrimaryIsUnavailable(result)) {
		console.warn({
			message: "search d1 primary fallback",
			error: result.error,
			status: result.status,
			index
		});
		return null;
	}
	const status = result.status ?? 502;
	searchLog.add({ searchStatus: status });
	let errorBody: object = GENERIC_UPSTREAM_ERROR;
	if (result.body !== null && typeof result.body === "object" && !Array.isArray(result.body)) {
		errorBody = result.body as object;
	}
	searchLog.emitError({ message: "search d1 primary error: " + result.error });
	return searchError(c, upstreamSearchErrorStatus(status), errorBody);
}
async function evalIsLeech(leechHandlingActive: boolean, data: R2Bucket, ipAddress: string | undefined): Promise<boolean> {
	let isLeech: boolean = false;
	if (leechHandlingActive && ipAddress) {
		const object = await data.get("leeches");

		if (object != null) {
			var leeches: string[] = await object.json();
			if (leeches.indexOf(ipAddress) >= 0) {
				isLeech = true;
			}
		}
	}
	return isLeech;
}

function createLeachResponse(c: ActionContext, searchLog: searchLogCollector) {
	const leechResponse = {
		"@odata.context": null,
		"@search.engine": "azure",
		"@odata.count": 1,
		"@search.facets": {
			"subjects": [],
			"podcastName": []
		},
		"value": [{
			"@search.score": 1.0,
			"id": "00000000-0000-0000-0000-000000000000",
			"episodeTitle": "Leech Detected",
			"podcastName": "Leech Detected",
			"episodeDescription": "Contact leeching@cultpodcasts.com.",
			"release": "1970-01-01T00:00:00Z",
			"duration": "01:00:00.0000000",
			"explicit": false,
			"spotify": null,
			"apple": null,
			"youtube": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			"subjects": []
		}]
	};
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	searchLog.emitWarn({ leech: true });
	return c.json(leechResponse, 200);
}
