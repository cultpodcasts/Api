export interface Env {
		Content: R2Bucket;
}

export default {
		async fetch(request: Request, env: Env) {
				const { pathname, searchParams } = new URL(request.url);
				const homeRoute = "/homepage";
				const azureSearchRoute = "/api";
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

						return new Response(object.body, {
								headers
						});
				}

				if (pathname.startsWith(azureSearchRoute)) {
						if (request.method == "GET") {
								const searchPath = pathname.substring(azureSearchRoute.length + 1);
								const API_HOST = "https://cultpodcasts.search.windows.net/indexes/cultpodcasts-two/docs?api-version=2023-07-01-Preview&";
								const url = `${API_HOST}${searchPath}${searchParams}`;

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
								const API_HOST = "https://cultpodcasts.search.windows.net/indexes/cultpodcasts-two/docs/search?api-version=2023-07-01-Preview";
								const url = `${API_HOST}`;

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

								const headers = new Headers();
								headers.set("Cache-Control", "max-age=600");
								headers.append("Content-Type", "application/json");
								headers.append("Access-Control-Allow-Origin", "*");
								headers.append("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
								headers.append("x-flow", "2");

								if (response.status !=200) {
										return new Response(response.body, { headers, status: response.status })
								}

								let body: any = await response.json();
								body["@odata.context"] = null;
								var bodyJson = JSON.stringify(body);
								return new Response(bodyJson, { headers })
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
