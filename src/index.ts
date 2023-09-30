export interface Env {
		DB: D1Database;
		Content: R2Bucket;
}

export default {
		async fetch(request: Request, env: Env) {
				const { pathname, searchParams } = new URL(request.url);
				const searchRoute = "/api/episode_search";
				const homeRoute = "/api/homepage";
				const sqlLimit = 100;
				const corsHeaders = {
						"Access-Control-Allow-Origin": "*",//"https://cultpodcasts.com",
						"Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
						"Access-Control-Max-Age": "86400"
				};

				if (request.method === "OPTIONS") {
						// Handle CORS preflight requests
						return new Response(null, {
								headers: {
										...corsHeaders
								}
						});
				}

				if (pathname.startsWith(searchRoute)) {
						var searchTerms = decodeURIComponent(pathname.substring(searchRoute.length + 1));
						let pageSql = "";
						if (searchParams.has("page")) {
								var pageSearchComponent = searchParams.get("page");
								if (pageSearchComponent) {
										var page: number = parseInt(pageSearchComponent);
										pageSql = ` OFFSET ${(page - 1) * sqlLimit}`
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
								ORDER BY rank
								LIMIT ${sqlLimit}${pageSql}
						`
						)
								.bind(searchTerms)
								.all();
						return Response.json(results,
								{
										headers: {
												...corsHeaders
										}
								});
				}

				if (pathname.startsWith(homeRoute)) {

						const object = await env.Content.get("homepage");

						if (object === null) {
								return new Response('Object Not Found', { status: 404 });
						}

						const headers = new Headers();
						object.writeHttpMetadata(headers);
						headers.set('etag', object.httpEtag);
						headers.set("Cache-Control", "max-age=600");
						headers.append("Access-Control-Allow-Origin", "*");
						headers.append("Access-Control-Allow-Methods", "GET,OPTIONS");


						return new Response(object.body, {
								headers,
						});

				}

				return new Response(
						`Call ${searchRoute} to search episode descriptions
						Call ${homeRoute} to get the last 7-days of new releases
						`,
						{
								headers: {
										...corsHeaders
								}
						});
		},
};

