import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { searchLogCollector } from "./searchLogCollector";
import { oDataSearchModel } from "./oDataSearchModel";
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
	const raw = await response.text();
	if (!raw) {
		return { error: "Upstream search error" };
	}
	try {
		return JSON.parse(raw) as object;
	} catch {
		return { error: raw };
	}
}

export async function search(c: ActionContext): Promise<Response> {
	const leechHandlingActive: boolean = false;
	let searchLog = new searchLogCollector();
	searchLog.collectRequest(c);
	let isLeech: boolean = await evalIsLeech(leechHandlingActive, c.env.Data, c.req.header('cf-connecting-ip'));
	if (!isLeech) {
		return c.req
			.json()
			.then(async (data: oDataSearchModel) => {
				rewriteLegacyPodcastNameInSearchRequest(data as unknown as Record<string, unknown>);
				let requestBody = JSON.stringify(data);
				searchLog.collectSearchRequest(data);
				const response = await fetch(c.env.apihost, {
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
				searchLog.add({ searchStatus: response.status });
				AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
				if (response.status != 200) {
					searchLog.emitError();
					const errorBody = await parseUpstreamSearchErrorBody(response);
					return c.json(errorBody, upstreamSearchErrorStatus(response.status));
				}
				let body: any = await response.json();
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
			})
			.catch(() => {
				if (!searchLog.hasFlushed()) {
					searchLog.addMessage("bad_json");
					searchLog.emitError({ message: "search bad_json error" });
				}
				return c.json({ error: "Bad request" }, 400);
			});
	} else {
		return createLeachResponse(c, searchLog);
	}
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
