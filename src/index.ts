export interface Env {
		DB: D1Database;
}

//const cache = caches.default;
const homepageApiUrl = "https://api-cultpodcasts.azurewebsites.net/api/homepage";
const homepageRequest = new Request(homepageApiUrl);

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
											 date(e.Release) AS Released,
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
						//return cacheHomepage();
						let response = await fetch(homepageRequest, {
								cf: {
										cacheTtl: 600,
										cacheEverything: true
								}
						});
						response = new Response(response.body, response);
						response.headers.set("Cache-Control", "max-age=600");
						response.headers.append("Access-Control-Allow-Origin", "*");
						response.headers.append("Access-Control-Allow-Methods", "GET,OPTIONS");
						return response;
				}

				return new Response(
						"Call /api/episode_search to search episode descriptions",
						{
								headers: {
										...corsHeaders
								}
						});//check
		},

		//async scheduled(
		//		event: ScheduledEvent,
		//		env: Env,
		//		ctx: EventContext<Env, any, any>
		//) {
		//		ctx.waitUntil(handleSchedule(event, env));
		//},
};

//function handleSchedule(
//		event: ScheduledEvent,
//		env: Env
//): Promise < Response > {

//		return cacheHomepage();
//}

// async function cacheHomepage(): Promise<Response> {
//		let response = await fetch(homepageRequest, {
//				cf: {
//						cacheTtl: 600,
//						cacheEverything: true
//				}
//		});
//		response = new Response(response.body, response);
//		response.headers.set("Cache-Control", "max-age=600");
//		response.headers.append("Access-Control-Allow-Origin", "*");
//		response.headers.append("Access-Control-Allow-Methods", "GET,OPTIONS");
//		return response
//}
