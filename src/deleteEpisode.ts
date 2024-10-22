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
			console.log(`Successfully used secure-episode-endpoint.`);
			return new Response(resp.body);
		} else if (resp.status == 404) {
			console.log(`Failed to use secure-episode-endpoint. Episode not found.`);
			return new Response(resp.body, {status: resp.status});
		} else if (resp.status == 300) {
			console.log(`Failed to use secure-episode-endpoint. Multple podcast/episodes found.`);
			return new Response(resp.body, {status: resp.status});
		} else {
			console.log(`Failed to use secure-episode-endpoint. Response code: '${resp.status}'.`);
			return c.json({ error: "Error" }, 500);
		}
	}
	return c.json({ error: "Unauthorised" }, 403);
}
