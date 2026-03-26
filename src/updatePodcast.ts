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
        logCollector.add({ status: resp.status });
		if (resp.status == 202) {
			logCollector.addMessage(`Successfully used secure-podcast-endpoint.`);
			console.log(logCollector.toEndpointLog());
			return c.newResponse(resp.body);
		} else if (resp.status == 404) {
			logCollector.addMessage(`Unable to find podcast.`);
			console.error(logCollector.toEndpointLog());
			return c.newResponse(resp.body, resp.status);
		} else {
			logCollector.addMessage(`Failed to use secure-podcast-endpoint.`);
			console.error(logCollector.toEndpointLog());
			return c.json({ error: "Error" }, 500);
		}
	}
	logCollector.addMessage("Unauthorised to use updatePodcast.");
	console.error(logCollector.toEndpointLog());
	return c.json({ error: "Unauthorised" }, 403);
}
