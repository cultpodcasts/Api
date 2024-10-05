import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";

export async function search(c: ActionContext): Promise<Response> {
	const leechHandlingActive: boolean = false;
	const url = `${c.env.apihost}`;
	let dataPoint: AnalyticsEngineDataPoint = { indexes: [], blobs: [] };
	let ipAddress: string = "";
	let asn: string = "";
	let city: string = "";
	if (c.req.raw.cf != undefined && c.req.raw.cf) {
		dataPoint.blobs!.push(c.req.raw.cf.clientTrustScoretr as string);
		asn = c.req.raw.cf.asn as string;
		dataPoint.blobs!.push(asn);
		ipAddress = c.req.header('cf-connecting-ip') as string;
		dataPoint.blobs!.push(ipAddress);
		dataPoint.blobs!.push(c.req.header('User-Agent') as string);
		if (c.req.raw.cf.city) {
			city = c.req.raw.cf.city as string;
			dataPoint.blobs!.push(city);
		}
		if (c.req.raw.cf.country) {
			dataPoint.blobs!.push(c.req.raw.cf.country as string);
		}
	}
	let isLeech: boolean = false;

	if (leechHandlingActive) {
		const object = await c.env.Data.get("leeches");

		if (object != null) {
			var leeches: string[] = await object.json();
			console.log(`ip-address: ${ipAddress} index: ${leeches.indexOf(ipAddress)} lookup: ${JSON.stringify(leeches)}`);
			if (leeches.indexOf(ipAddress) >= 0) {
				isLeech = true;
			}
		}
	}
	if (!isLeech) {
		return c.req
			.json()
			.then(async (data: any) => {
				let requestBody = JSON.stringify(data);
				let index: string = "";
				if (data.search) {
					index = data.search;
					dataPoint.blobs!.push(data.search);
					dataPoint.blobs!.push("search");
				}
				if (data.filter) {
					let filter: string = data.filter;
					if (filter.indexOf("(podcastName eq '") == 0) {
						const idFilter = "') and (id eq ";
						let filterCutoff = -2;
						if (filter.indexOf(idFilter) >= 0) {
							filterCutoff = filterCutoff = filter.indexOf(idFilter);
							const episodeId = filter.slice(filterCutoff + idFilter.length, -2);
							dataPoint.blobs!.push("episode");
							dataPoint.blobs!.push(episodeId);
						} else {
							dataPoint.blobs!.push("podcast");
						}
						let query = filter.slice(17, filterCutoff);
						dataPoint.blobs!.push(query);
						if (index) {
							index += " podcast=" + query;
						} else {
							index = "podcast=" + query;
						}
					} else if (filter.indexOf("subjects/any(s: s eq '") == 0) {
						let query = filter.slice(22, -2);
						if (index) {
							index += " subject=" + query;
						} else {
							index = "subject=" + query;
						}
						dataPoint.blobs!.push(query);
						dataPoint.blobs!.push("subject");
					} else {
						console.log("Unrecognised search filter");
					}
				}
				dataPoint.indexes!.push(index);

				if (!data.search && !data.filter) {
					console.log("Unrecognised search request");
				}
				if (dataPoint) {
					dataPoint.blobs?.push(data.skip);
					dataPoint.blobs?.push(data.orderby);
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
				if (dataPoint) {
					dataPoint.blobs?.push(response.status.toString());
					try {
						c.env.Analytics.writeDataPoint(dataPoint);
					} catch (error) {
						console.log(error);
					}
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
		dataPoint.blobs!.push("Leech");
		c.env.Analytics.writeDataPoint(dataPoint);
		return c.json(leechResponse, 200);
	}
}
