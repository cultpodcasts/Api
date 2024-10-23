import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { searchOperationCollector } from "./searchOperationCollector";
import { oDataSearchModel } from "./oDataSearchModel";

export async function search(c: ActionContext): Promise<Response> {
	const leechHandlingActive: boolean = false;
	const url = `${c.env.apihost}`;
	let searchLog = new searchOperationCollector();
	searchLog.collectRequest(c);
	let isLeech: boolean = await evalIsLeech(leechHandlingActive, c.env.Data, c.req.header('cf-connecting-ip'));
	if (!isLeech) {
		return c.req
			.json()
			.then(async (data: oDataSearchModel) => {
				let requestBody = JSON.stringify(data);
				searchLog.collectSearchRequest(data);
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
					console.error(searchLog.toSearchLog());
				} else {
					console.log(searchLog.toSearchLog());
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

function createLeachResponse(c: ActionContext, searchLog: searchOperationCollector) {
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
	console.warn(searchLog.toSearchLog());
	return c.json(leechResponse, 200);
}

