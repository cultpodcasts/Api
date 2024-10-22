import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";

export async function updatePodcast(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
	const id = c.req.param('id');
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
		const url = `${c.env.securePodcastEndpoint}/${id}`;
		const data: any = await c.req.json();
		const body: string = JSON.stringify(data);
		const resp = await fetch(url, {
			headers: buildFetchHeaders(c.req, c.env.securePodcastEndpoint),
			method: "POST",
			body: body
		});
		if (resp.status == 202) {
			console.log({ message: `Successfully used secure-podcast-endpoint.`, status: resp.status });
			return new Response(resp.body);
		} else if (resp.status == 404) {
			console.error({ message: `Unable to find podcast.`, status: resp.status });
			return new Response(resp.body, { status: resp.status });
		} else {
			console.error({ message: `Failed to use secure-podcast-endpoint.`, status: resp.status });
			return c.json({ error: "Error" }, 500);
		}
	}
	console.error({ message: "Unauthorised to use updatePodcast." })
	return c.json({ error: "Unauthorised" }, 403);
}
