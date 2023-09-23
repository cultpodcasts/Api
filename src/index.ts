export interface Env {
		DB: D1Database;
}

export default {
		async fetch(request: Request, env: Env) {
				const { pathname } = new URL(request.url);
				const searchRoute = "/api/episode_search";
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


						// If you did not use `DB` as your binding name, change it here
						const { results } = await env.DB.prepare(
								`
								SELECT p.Name AS Podcast,
								       p.Publisher,
											 e.Title,
											 e.Description,
											 e.Release AS Released,
											 time(e.Length) AS Length,
											 e.Explicit,
											 e.Spotify,
											 e.Apple,
											 e.YouTube
								FROM EpisodesText t
								JOIN Episodes e ON t.Guid = e.Guid
								JOIN Podcasts p ON e.PodcastId = p.Id
								WHERE EpisodesText MATCH ?
								ORDER BY rank
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

				if (pathname.startsWith("/api/homepage")) {

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
						"Call /api/episode_search to search episode descriptions",
						{
								headers: {
										...corsHeaders
								}
						});
		},
};

