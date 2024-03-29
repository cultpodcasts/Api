export interface Env {
		Content: R2Bucket;
		Analytics: AnalyticsEngineDataset;
		DB: D1Database;
		apikey: string;
		apihost: string;
		gatewayKey: string;
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

				if (pathname.startsWith(homeRoute) && request.method === "GET") {
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

				if (pathname.startsWith(searchRoute) && request.method === "POST") {
						const url = `${env.apihost}`;
						return request
								.json()
								.then(async (data: any) => {
										let dataPoint: AnalyticsEngineDataPoint = { indexes: [], blobs: [] };
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
														let query = filter.slice(17, -2);
														if (index) {
																index += " podcast=" + query;
														} else {
																index = "podcast=" + query;
														}
														dataPoint.blobs!.push(query);
														dataPoint.blobs!.push("podcast");
												} else if (filter.indexOf("subjects/any(s: s eq '") == 0) {
														let query = filter.slice(22, - 2);
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

										if (!data.search && !data.filter)
										{ 
												console.log("Unrecognised search request");
										}
										if (dataPoint) {
												dataPoint.blobs?.push(data.skip);
												dataPoint.blobs?.push(data.orderby);
										}
										if (dataPoint) {
												if (request.cf) {
														if (request.cf.city) {
																dataPoint.blobs?.push(request.cf.city as string);
														}
														if (request.cf.country) {
																dataPoint.blobs?.push(request.cf.country as string);
														}
												}
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
										if (dataPoint) {
												dataPoint.blobs?.push(response.status.toString());
												env.Analytics.writeDataPoint(dataPoint);
										}

										const headers = new Headers();
										headers.set("Cache-Control", "max-age=600");
										headers.append("Content-Type", "application/json");
										headers.append("Access-Control-Allow-Origin", "*");
										headers.append("Access-Control-Allow-Methods", "POST,GET,OPTIONS");

										if (response.status != 200) {
												return new Response(response.body, { headers, status: response.status })
										}

										let body: any = await response.json();
										body["@odata.context"] = null;
										let bodyJson = JSON.stringify(body);

										return new Response(bodyJson, { headers })
								});
				}

				if (pathname.startsWith(submitRoute)) {
						if (request.method === "POST") {

								const headers = new Headers();
								headers.set("Cache-Control", "max-age=600");
								headers.append("Content-Type", "application/json");
								headers.append("Access-Control-Allow-Origin", "*");
								headers.append("Access-Control-Allow-Methods", "POST,GET,OPTIONS");

								return request
										.json()
										.then(async (data: any) => {
												let url: URL | undefined;
												let urlParam = data.url;
												if (urlParam == null) {
														return new Response(JSON.stringify({ error: "Missing url param." }), { headers, status: 400 });
												}
												try {
														url = new URL(urlParam);
												} catch {
														return new Response(JSON.stringify({ error: `Invalid url '${data.url}'.` }), { headers, status: 400 });
												}
												let insert = env.DB
														.prepare("INSERT INTO urls (url, timestamp, timestamp_date, ip_address, country, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
														.bind(url.toString(), Date.now(), new Date().toLocaleString(), request.headers.get("CF-Connecting-IP"), request.headers.get("CF-IPCountry"), request.headers.get("User-Agent"));
												let result = await insert.run();

												if (result.success) {
														return new Response(JSON.stringify({ success: "Submitted" }), { headers });
												} else {
														return new Response(JSON.stringify({ error: "Unable to accept" }), { headers, status: 400 });
												}
										});
						} else if (request.method === "GET" && request.headers.get("key") === env.gatewayKey) {
								let submissionIds = env.DB
										.prepare("SELECT id FROM urls WHERE state=0");
								let result = await submissionIds.all();
								if (result.success) {
										const inClause = result.results
												.map((urlId) => {
														if (!Number.isInteger(urlId.id)) { throw Error("invalid id, expected an integer"); }
														return urlId.id;
												})
												.join(',');
										let urls = "SELECT id, url, timestamp_date, ip_address, country, user_agent FROM urls WHERE id IN ($urlIds)";
										urls = urls.replace('$urlIds', inClause);
										let urlResults = await env.DB
												.prepare(urls)
												.run();
										if (urlResults.success) {
												let update = "UPDATE urls SET state=1 WHERE id IN ($urlIds)";
												update = update.replace('$urlIds', inClause);
												let raiseState = await env.DB
														.prepare(update)
														.run();
												if (raiseState.success) {
														return new Response(JSON.stringify(urlResults.results));
												} else {
														return new Response("Failure to raise state of new submissons in ids " + result.results.join(", "), { status: 400 })
												}
										} else {
												return new Response("Unable to retrieve new submissions", { status: 500 });
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
