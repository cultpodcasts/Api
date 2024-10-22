import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { searchLog } from "./searchLog";
import { searchMode } from "./searchMode";

export async function search(c: ActionContext): Promise<Response> {
	const leechHandlingActive: boolean = false;
	const url = `${c.env.apihost}`;
	let searchLog: searchLog = {};
	let ipAddress: string = "";

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
	let isLeech: boolean = await evalIsLeech(leechHandlingActive, c.env.Data, ipAddress);
	if (!isLeech) {
		return c.req
			.json()
			.then(async (data: any) => {
				let requestBody = JSON.stringify(data);
				if (data.search) {
					searchLog.query = data.search;
					searchLog.mode = searchMode.search;
				}
				if (data.filter) {
					let filter: string = data.filter;
					if (filter.indexOf("(podcastName eq '") == 0) {
						const idFilter = "') and (id eq ";
						let filterCutoff = -2;
						if (filter.indexOf(idFilter) >= 0) {
							filterCutoff = filterCutoff = filter.indexOf(idFilter);
							const episodeId = filter.slice(filterCutoff + idFilter.length, -2);

							searchLog.mode = searchMode.episode;
							searchLog.episodeId = episodeId;
						} else {
							searchLog.mode = searchMode.podcast;
						}
						let query = filter.slice(17, filterCutoff);
						searchLog.additionalQuery = query;
					} else if (filter.indexOf("subjects/any(s: s eq '") == 0) {
						let query = filter.slice(22, -2);
						searchLog.additionalQuery = query;
						searchLog.mode = searchMode.subject;
					} else {
						console.log({ message: `Unrecognised search filter: '${filter}'.` });
					}
				}

				if (!data.search && !data.filter) {
					console.log({ message: "Unrecognised search request. No search or filter." });
				}
				if (searchLog) {
					searchLog.skip = data.skip;
					searchLog.orderBy = data.orderby;
				}

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
				if (searchLog) {
					searchLog.searchStatus = response.status.toString();
					console.log(searchLog);
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

function createLeachResponse(c: ActionContext, dataPoint: searchLog) {
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
	dataPoint.leech = true;
	console.log(dataPoint);
	return c.json(leechResponse, 200);
}

