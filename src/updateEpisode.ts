import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";

export async function updateEpisode(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	const id = c.req.param('id');
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE"] });
	if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
		const url = new URL(`${getEndpoint(Endpoint.episode, c.env)}/${id}`);
		const data: any = await c.req.json();
		const body: string = JSON.stringify(data);
		const resp = await fetch(url, {
			headers: buildFetchHeaders(c.req, url),
			method: "POST",
			body: body
		});
        logCollector.add({ status: resp.status });
		if (resp.status == 202) {
			logCollector.addMessage(`Successfully used secure-episode-endpoint.`);
			console.log(logCollector.toEndpointLog());
			return c.newResponse(resp.body);
		} else {
			logCollector.addMessage(`Failed to use secure-episode-endpoint.`);
			console.error(logCollector.toEndpointLog());
			return c.json({ error: "Error" }, 500);
		}
	}
	logCollector.addMessage("Unauthorised to use updateEpisode.");
	console.error(logCollector.toEndpointLog());
	return c.json({ error: "Unauthorised" }, 403);
}

export async function updatePodcastEpisode(c: Auth0ActionContext): Promise<Response> {
console.log("updatePodcastEpisode called.");
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	const podcastId = c.req.param('podcastId');
	const episodeId = c.req.param('episodeId');
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE"] });
	if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
		const url = new URL(`${getEndpoint(Endpoint.episode, c.env)}/${podcastId}/${episodeId}`);
		const data: any = await c.req.json();
		const body: string = JSON.stringify(data);
		const headers= buildFetchHeaders(c.req, url);
		const resp = await fetch(url, {
			headers: headers,
			method: "POST",
			body: body
		});
        logCollector.add({ status: resp.status });
		if (resp.status == 202) {
			logCollector.addMessage(`Successfully used secure-episode-endpoint.`);
			console.log(logCollector.toEndpointLog());
			return c.newResponse(resp.body);
		} else {
			logCollector.addMessage(`Failed to use secure-episode-endpoint.`);
			console.error(logCollector.toEndpointLog());
			return c.json({ error: "Error" }, 500);
		}
	}
	logCollector.addMessage("Unauthorised to use updateEpisode.");
	console.error(logCollector.toEndpointLog());
	return c.json({ error: "Unauthorised" }, 403);
}