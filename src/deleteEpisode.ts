import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";


export async function deleteEpisode(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
	const id = c.req.param('id');
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE"] });
	if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
		const url = `${c.env.secureEpisodeEndpoint}/${id}`;
		const resp = await fetch(url, {
			headers: buildFetchHeaders(c.req, c.env.secureEpisodeEndpoint),
			method: "DELETE"
		});
		if (resp.status == 200) {
			console.log({ message: `Successfully used secure-episode-endpoint.`, status: resp.status });
			return new Response(resp.body);
		} else if (resp.status == 404) {
			console.error({ message: `Failed to use secure-episode-endpoint. Episode not found.`, status: resp.status });
			return new Response(resp.body, { status: resp.status });
		} else if (resp.status == 400) {
			console.error({ message: `Failed to use secure-episode-endpoint. Episode published.`, status: resp.status });
			return new Response(resp.body, { status: resp.status });
		} else if (resp.status == 300) {
			console.error({ message: `Failed to use secure-episode-endpoint. Multple podcast/episodes found.`, status: resp.status });
			return new Response(resp.body, { status: resp.status });
		} else {
			console.error({ message: `Failed to use secure-episode-endpoint..`, status: resp.status });
			return c.json({ error: "Error" }, 500);
		}
	}
	console.error({ message: "Unauthorised to use deleteEpisode." })
	return c.json({ error: "Unauthorised" }, 403);
}
