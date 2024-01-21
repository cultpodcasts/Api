export interface Env {
		Content: R2Bucket;
		Analytics: AnalyticsEngineDataset;
		apikey: string;
		apihost: string;
}

export default {
		async fetch(request: Request, env: Env) {
				const { pathname, searchParams } = new URL(request.url);
				const homeRoute = "/homepage";
				const searchRoute = "/api";
				const corsHeaders = {
						"Access-Control-Allow-Origin": "*", //"https://cultpodcasts.com",
						"Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
						"Access-Control-Max-Age": "86400",
						"Access-Control-Allow-Headers": "content-type"
				};

				if (request.method === "OPTIONS") {
						return new Response(null, {
								headers: {
										...corsHeaders,
								},
						});
				}

				if (pathname.startsWith(homeRoute)) {
						const object = await env.Content.get("homepage");

						if (object === null) {
								return new Response("Object Not Found", { status: 404 });
						}

						const headers = new Headers();
						object.writeHttpMetadata(headers);
						headers.set("etag", object.httpEtag);
						headers.set("Cache-Control", "max-age=600");
						headers.append("Access-Control-Allow-Origin", "*");
						headers.append("Access-Control-Allow-Methods", "GET,OPTIONS");

						return new Response(object.body, { headers });
				}

				if (pathname.startsWith(searchRoute)) {
						const url = `${env.apihost}`;

						return request
								.json()
								.then(async (data: any) => {
										let dataPoint: AnalyticsEngineDataPoint | undefined;
										let requestBody = JSON.stringify(data);
										if (data.search) {
												dataPoint = { indexes: [data.search], blobs: [data.search, "search"] };
										} else if (data.filter) {
												let filter: string = data.filter;
												if (filter.indexOf("(podcastName eq '") == 0) {
														let query = filter.slice(17, -2);
														dataPoint = { indexes: [query], blobs: [query, "podcast"] };
												} else if (filter.indexOf("subjects/any(s: s eq '") == 0) {
														let query = filter.slice(22, - 2);
														dataPoint = { indexes: [query], blobs: [query, "subject"] }
												} else {
														console.log("Unrecognised search filter");
												}
										} else {
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
														"api-key": env.apikey,
														"content-type": "application/json;charset=UTF-8",
												},
												body: requestBody,
												method: "POST"
										});

										const headers = new Headers();
										headers.set("Cache-Control", "max-age=600");
										headers.append("Content-Type", "application/json");
										headers.append("Access-Control-Allow-Origin", "*");
										headers.append("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
										headers.append("x-flow", "2");

										if (response.status != 200) {
												return new Response(response.body, { headers, status: response.status })
										}

										let body: any = await response.json();
										body["@odata.context"] = null;
										let bodyJson = JSON.stringify(body);

										if (dataPoint) {
												if (request.cf) {
														if (request.cf.city) {
																dataPoint.blobs?.push(request.cf.city as string);
														}
														if (request.cf.country) {
																dataPoint.blobs?.push(request.cf.country as string);
														}
												}
												//console.log(JSON.stringify(dataPoint));
										}

										env.Analytics.writeDataPoint(dataPoint);

										return new Response(bodyJson, { headers })
								});
				}

				return new Response(
						`Call ${homeRoute} to get the last 7-days of new releases
${pathname}`,
						{
								headers: {
										...corsHeaders,
								},
						}
				);
		},
};
