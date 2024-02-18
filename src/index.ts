export interface Env {
		Content: R2Bucket;
		Analytics: AnalyticsEngineDataset;
		DB: D1Database;
		apikey: string;
		apihost: string;
}

export default {
		async fetch(request: Request, env: Env) {
				const { pathname, searchParams } = new URL(request.url);
				const homeRoute = "/homepage";
				const searchRoute = "/api";
				const submitRoute = "/submit";
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

				if (pathname.startsWith(homeRoute) && request.method==="GET") {
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

				if (pathname.startsWith(searchRoute) && request.method==="POST") {
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

				if (pathname.startsWith(submitRoute)) {
						if (request.method === "POST") {
								return request
										.json()
										.then(async (data: any) => {
												let url: URL | undefined;
												let urlParam = data.url;
												if (urlParam == null) {
														return new Response("Missing url param.", { status: 400 });
												}
												try {
														url = new URL(urlParam);
												} catch {
														return new Response(`Invalid url '${data.url}'.`, { status: 400 });
												}
												let insert = env.DB
														.prepare("INSERT INTO urls (url, timestamp, timestamp_date, ip_address, country, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
														.bind(url.toString(), Date.now(), new Date().toLocaleString(), request.headers.get("CF-Connecting-IP"), request.headers.get("CF-IPCountry"), request.headers.get("User-Agent"));
												let result = await insert.run();

												if (result.success) {
														return new Response();
												} else {
														return new Response("Unable to accept", { status: 400 });
												}
										});
						} else if (request.method === "GET") {
								let submissionIds =  env.DB
										.prepare("SELECT id FROM urls WHERE state=0");
								let result = await submissionIds.all();
								if (result.success) {
										let raiseState = await env.DB
												.prepare("UPDATE urls SET state=1 WHERE id IN (?)")
												.bind(result.results)
												.run();
										if (raiseState.success) {
												return new Response(JSON.stringify(result.results))
										} else {
												return new Response("Failure to raise state of new submissons in ids " + result.results.join(", "), { status: 400 })
										}
								} else {
										return new Response(result.error, { status: 500 });
								}
						}
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
