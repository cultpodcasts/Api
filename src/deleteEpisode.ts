import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";
import { LogCollector } from "./LogCollector";

export async function deleteEpisode(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	const id = c.req.param('id');
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE"] });
	if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
		const url = new URL(`${getEndpoint(Endpoint.episode, c.env)}/${id}`);
		const resp = await fetch(url, {
			headers: buildFetchHeaders(c.req, url),
			method: "DELETE"
		});
		if (resp.status == 200) {
			logCollector.add({ message: `Successfully used secure-episode-endpoint.`, status: resp.status });
			console.log(logCollector.toEndpointLog());
			return c.json(resp.body);
		} else if (resp.status == 404) {
			logCollector.add({ message: `Failed to use secure-episode-endpoint. Episode not found.`, status: resp.status });
			console.error(logCollector.toEndpointLog());
			return c.notFound();
		} else if (resp.status == 400) {
			logCollector.add({ message: `Failed to use secure-episode-endpoint. Episode published.`, status: resp.status });
			console.error(logCollector.toEndpointLog());
			return c.json(resp.body, resp.status);
		} else if (resp.status == 300) {
			logCollector.add({ message: `Failed to use secure-episode-endpoint. Multple podcast/episodes found.`, status: resp.status });
			console.error(logCollector.toEndpointLog());
			return c.json(resp.body, resp.status);
		} else {
			logCollector.add({ message: `Failed to use secure-episode-endpoint..`, status: resp.status });
			console.error(logCollector.toEndpointLog());
			return c.json({ error: "Error" }, 500);
		}
	}
	logCollector.add({ message: "Unauthorised to use deleteEpisode." });
	console.error(logCollector.toEndpointLog());
	return c.json({ error: "Unauthorised" }, 403);
}
