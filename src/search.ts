import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { searchLog, searchLogImpl } from "./searchLog";
import { searchMode } from "./searchMode";

export async function search(c: ActionContext): Promise<Response> {
	const leechHandlingActive: boolean = false;
	const url = `${c.env.apihost}`;
	let searchLog = createSearchLog(c);
	let ipAddress: string = "";
	let isLeech: boolean = await evalIsLeech(leechHandlingActive, c.env.Data, ipAddress);
	if (!isLeech) {
		return c.req
			.json()
			.then(async (data: any) => {
				let requestBody = JSON.stringify(data);
				if (data.search) {
					searchLog.add({query:data.search, mode:searchMode.search});
				}
				if (data.filter) {
					let filter: string = data.filter;
					if (filter.indexOf("(podcastName eq '") == 0) {
						const idFilter = "') and (id eq ";
						let filterCutoff = -2;
						let query = filter.slice(17, filterCutoff);
						if (filter.indexOf(idFilter) >= 0) {
							filterCutoff = filterCutoff = filter.indexOf(idFilter);
							const episodeId = filter.slice(filterCutoff + idFilter.length, -2);
							searchLog.add({ additionalQuery: query, mode: searchMode.episode, episodeId: episodeId, filter: filter });
						} else {
							searchLog.add({ additionalQuery: query, mode: searchMode.podcast, filter: filter });
						}
					} else if (filter.indexOf("subjects/any(s: s eq '") == 0) {
						let query = filter.slice(22, -2);
						searchLog.add({ additionalQuery: query, mode: searchMode.subject });
					} else {
						searchLog.add({ unrecognisedSearchFilter: true, filter: filter });
					}
				}
				if (!data.search && !data.filter) {
					searchLog.add({ unrecognisedSearchFilter: true, missingSearch: true });
				}
				if (data.skip) {
					searchLog.add({ skip: parseInt(data.skip) });
				}
				searchLog.add({  orderBy: data.orderby });
				let response = await fetch(url, {
					cf: {
						cacheEverything: true,
						cacheTtl: 600
					},
					headers: {
						"api-key": c.env.apikey,
						"content-type": "application/json;charset=UTF-8",
					},
					body: requestBody,
					method: "POST"
				});
				searchLog.add({ searchStatus: response.status });
				if (searchLog.error) {
					console.error(searchLog as searchLog);
				} else {
					console.log(searchLog as searchLog);
				}
				AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
				if (response.status != 200) {
					return c.json(response.body, 400);
				}
				let body: any = await response.json();
				body["@odata.context"] = null;
				return c.json(body, 200);
			});
	} else {
		return createLeachResponse(c, searchLog);
	}
}

function createSearchLog(c: ActionContext): searchLogImpl {
	var searchLog: searchLogImpl = new searchLogImpl();
	if (c.req.raw.cf != undefined && c.req.raw.cf) {
		searchLog.clientTrustScoretr = c.req.raw.cf.clientTrustScoretr as string;
		searchLog.asn = c.req.raw.cf.asn as string;
		searchLog.ipAddress = c.req.header('cf-connecting-ip') as string;
		searchLog.userAgent = c.req.header('User-Agent') as string;
		if (c.req.raw.cf.city) {
			searchLog.city = c.req.raw.cf.city as string;
		}
		if (c.req.raw.cf.country) {
			searchLog.country = c.req.raw.cf.country as string;
		}
	}
	return searchLog;
}

async function evalIsLeech(leechHandlingActive: boolean, data: R2Bucket, ipAddress: string): Promise<boolean> {
	let isLeech: boolean = false;
	if (leechHandlingActive) {
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

function createLeachResponse(c: ActionContext, searchLog: searchLogImpl) {
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
	searchLog.add({ leech: true });
	console.warn(searchLog as searchLog);
	return c.json(leechResponse, 200);
}

