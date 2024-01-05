export interface Env {
		DB: D1Database;
		Content: R2Bucket;
}

export default {
		async fetch(request: Request, env: Env) {
				const { pathname, searchParams } = new URL(request.url);
				const searchRoute = "/api/episode_search";
				const homeRoute = "/homepage";
				const azureSearchRoute = "/api";
				const sqlLimit = 20;
				const corsHeaders = {
						"Access-Control-Allow-Origin": "*", //"https://cultpodcasts.com",
						"Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
						"Access-Control-Max-Age": "86400",
						"Access-Control-Allow-Headers": "content-type"
				};

				if (request.method === "OPTIONS") {
						// Handle CORS preflight requests
						return new Response(null, {
								headers: {
										...corsHeaders,
								},
						});
				}

				if (pathname.startsWith(searchRoute)) {
						var searchTerms = decodeURIComponent(
								pathname.substring(searchRoute.length + 1)
						);
						let pageSql = "";
						const pageParam: string = "page";
						if (searchParams.has(pageParam)) {
								var pageSearchComponent = searchParams.get(pageParam);
								if (pageSearchComponent) {
										var page: number = parseInt(pageSearchComponent);
										pageSql = ` OFFSET ${(page - 1) * sqlLimit}`;
								}
						}

						let orderSql = "rank";
						const orderParam: string = "order";
						if (searchParams.has(orderParam)) {
								var orderSearchComponent = searchParams.get(orderParam);
								if (orderSearchComponent) {
										switch (orderSearchComponent) {
												case "date":
														orderSql = "release";
														break;
												case "date-desc":
														orderSql = "release DESC";
														break;
												default:
														orderSql;
														break;
										}
								}
						}

						const { results } = await env.DB.prepare(
								`
								SELECT p.Name AS podcastName,
								       p.Publisher AS publisher,
											 e.Title AS episodeTitle,
											 e.Description AS episodeDescription,
											 e.Release AS release,
											 time(e.Length) AS length,
											 e.Explicit AS explicit,
											 e.Spotify AS spotify,
											 e.Apple AS apple,
											 e.YouTube AS youtube
								FROM EpisodesText t
								JOIN Episodes e ON t.Guid = e.Guid
								JOIN Podcasts p ON e.PodcastId = p.Id
								WHERE EpisodesText MATCH ?
								ORDER BY ${orderSql}
								LIMIT ${sqlLimit}${pageSql}
						`
						)
								.bind(searchTerms)
								.all();
						return Response.json(results, {
								headers: {
										...corsHeaders,
										"Cache-Control": "max-age=600"
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

						return new Response(object.body, {
								headers
						});
				}

				if (pathname.startsWith(azureSearchRoute)) {
						if (request.method == "GET") {
								const searchPath = pathname.substring(azureSearchRoute.length + 1);
								const API_HOST = "https://cultpodcasts.search.windows.net/indexes/cultpodcasts-two/docs?api-version=2023-07-01-Preview&";
								const url = `${API_HOST}${searchPath}${searchParams}`;
								//return new Response(url);

								let response = await fetch(url, {
										cf: {
												cacheEverything: true,
												cacheTtl: 600
										},
										headers: {
												"api-key": "TBapMt2RTuulXdyMMICzPK5Jk2HyHNUXKhWX9Sex9IAzSeBS5J1Z",
										}
								});
								let body: any = await response.json();
								body["@odata.context"] = null;

								const headers = new Headers();
								headers.set("Cache-Control", "max-age=600");
								headers.append("Content-Type", "application/json");
								headers.append("Access-Control-Allow-Origin", "*");
								headers.append("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
								headers.append("x-flow", "1");

								return new Response(JSON.stringify(body), { headers })
						} else if (request.method == "POST") {
								console.log("In post request");
								const API_HOST = "https://cultpodcasts.search.windows.net/indexes/cultpodcasts-two/docs/search?api-version=2023-07-01-Preview";
								const url = `${API_HOST}`;
								console.log("Constructucted url: " + url);

								var requestBody:any =  request.body;
								let response = await fetch(url, {
										cf: {
												cacheEverything: true,
												cacheTtl: 600
										},
										headers: {
												"api-key": "TBapMt2RTuulXdyMMICzPK5Jk2HyHNUXKhWX9Sex9IAzSeBS5J1Z",
												"content-type": "application/json;charset=UTF-8",
										},
										body: requestBody,
										method: "POST"
								});
								console.log("Executed fetch");
								console.log("Fetch response code:" + response.status);

								const headers = new Headers();
								headers.set("Cache-Control", "max-age=600");
								headers.append("Content-Type", "application/json");
								headers.append("Access-Control-Allow-Origin", "*");
								headers.append("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
								headers.append("x-flow", "2");
								console.log("Set headers");


								if (response.status !=200) {
										console.log("Remote error")
										return new Response(response.body, { headers, status: response.status })
								}

								let body: any = await response.json();
								console.log("Loaded body");

								body["@odata.context"] = null;
								console.log("Scrubbed odata-context");

								var bodyJson = JSON.stringify(body);
								console.log("Stringified body");
								console.log(bodyJson);

								return new Response(bodyJson, { headers })
						}
				}

				return new Response(
						`Call ${searchRoute} to search episode descriptions
Call ${homeRoute} to get the last 7-days of new releases
${pathname}`,
						{
								headers: {
										...corsHeaders,
								},
						}
				);
		},
};
