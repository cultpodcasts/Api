import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { searchLogCollector } from "./searchLogCollector";
import { oDataSearchModel } from "./oDataSearchModel";
import { boostUnquotedPhraseInSearchRequest } from "./boostUnquotedPhrase";
import { rewriteLegacyPodcastNameInSearchRequest } from "./rewriteLegacyPodcastNameInSearchRequest";
import { searchMode } from "./searchMode";

/** Forward Azure AI Search error statuses: keep 4xx/5xx (incl. 429); other non-200 → 502. */
export function upstreamSearchErrorStatus(status: number): ContentfulStatusCode {
	if (status >= 400 && status <= 599) {
		return status as ContentfulStatusCode;
	}
	return 502;
}

export async function parseUpstreamSearchErrorBody(response: Response): Promise<object> {
	let raw: string;
	try {
		raw = await response.text();
	} catch {
		return { error: "Upstream search error" };
	}
	if (!raw) {
		return { error: "Upstream search error" };
	}
	try {
		return JSON.parse(raw) as object;
	} catch {
		return { error: raw };
	}
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
 * Upstream unreachable (fetch threw) or returned an unreadable success body. Bad gateway, not
 * the client's fault: never a 400, which the website treats as a request/field error.
 */
function badGateway(c: ActionContext, searchLog: searchLogCollector, message: string): Response {
	searchLog.addMessage("upstream_error");
	searchLog.emitError({ message: `search upstream error: ${message}` });
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	return c.json({ error: { code: "UpstreamSearchError", message: "Upstream search unavailable" } }, 502);
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
	try {
		const data: oDataSearchModel = await c.req.json();
		// Collect inbound body first so logs still see legacy podcastName
		// (stale-client signal + podcast-mode filter detection).
		searchLog.collectSearchRequest(data);
		rewriteLegacyPodcastNameInSearchRequest(data);
		boostUnquotedPhraseInSearchRequest(data);
		requestBody = JSON.stringify(data);
	} catch {
		searchLog.addMessage("bad_json");
		searchLog.emitError({ message: "search bad_json error" });
		return c.json({ error: "Bad request" }, 400);
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
		return badGateway(c, searchLog, e instanceof Error ? e.message : String(e));
	}

	searchLog.add({ searchStatus: response.status });
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	if (response.status != 200) {
		searchLog.emitError();
		const errorBody = await parseUpstreamSearchErrorBody(response);
		forwardUpstreamErrorHeaders(c, response);
		return c.json(errorBody, upstreamSearchErrorStatus(response.status));
	}

	let body: any;
	try {
		body = await response.json();
	} catch (e) {
		return badGateway(c, searchLog, `unreadable 200 body: ${e instanceof Error ? e.message : String(e)}`);
	}
	body["@odata.context"] = null;
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
