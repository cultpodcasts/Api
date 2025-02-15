import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";

export async function updatePodcast(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	const id = c.req.param('id');
	AddResponseHeaders(c, { methods: ["POST", "GET", "PUT", "OPTIONS"] });
	if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
		const url = new URL(`${getEndpoint(Endpoint.podcast, c.env)}/${id}`);
		const data: any = await c.req.json();
		const body: string = JSON.stringify(data);
		const resp = await fetch(url, {
			headers: buildFetchHeaders(c.req, url),
			method: c.req.method,
			body: body
		});
		if (resp.status == 202) {
			logCollector.add({ message: `Successfully used secure-podcast-endpoint.`, status: resp.status });
			return c.text("Accepted", resp.status);
		} else if (resp.status == 404) {
			logCollector.add({ message: `Unable to find podcast.`, status: resp.status });
			console.error(logCollector.toEndpointLog());
			return c.json(resp.json(), resp.status);
		} else {
			logCollector.add({ message: `Failed to use secure-podcast-endpoint.`, status: resp.status });
			console.error(logCollector.toEndpointLog());
			return c.json({ error: "Error" }, 500);
		}
	}
	logCollector.add({ message: "Unauthorised to use updatePodcast." });
	console.error(logCollector.toEndpointLog());
	return c.json({ error: "Unauthorised" }, 403);
}
