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
		logCollector.add({ status: resp.status });
		if (resp.status == 200) {
			logCollector.addMessage(`Successfully used secure-episode-endpoint.`);
			console.log(logCollector.toEndpointLog());
			return c.newResponse(resp.body);
		} else if (resp.status == 404) {
			logCollector.addMessage(`Failed to use secure-episode-endpoint. Episode not found.`);
			console.error(logCollector.toEndpointLog());
			return c.newResponse(resp.body, resp.status);
		} else if (resp.status == 400) {
			logCollector.addMessage(`Failed to use secure-episode-endpoint. Episode published.`);
			console.error(logCollector.toEndpointLog());
			return c.newResponse(resp.body, resp.status);
		} else if (resp.status == 300) {
			logCollector.addMessage(`Failed to use secure-episode-endpoint. Multple podcast/episodes found.`);
			console.error(logCollector.toEndpointLog());
			return c.newResponse(resp.body, resp.status);
		} else {
			logCollector.addMessage(`Failed to use secure-episode-endpoint..`);
			console.error(logCollector.toEndpointLog());
			return c.json({ error: "Error" }, 500);
		}
	}
	logCollector.addMessage("Unauthorised to use deleteEpisode.");
	console.error(logCollector.toEndpointLog());
	return c.json({ error: "Unauthorised" }, 403);
}

export async function deletePodcastEpisode(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	const podcastId = c.req.param('podcastId');
	const episodeId = c.req.param('episodeId');
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE"] });
	if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
		const url = new URL(`${getEndpoint(Endpoint.episode, c.env)}/${podcastId}/${episodeId}`);
		const resp = await fetch(url, {
			headers: buildFetchHeaders(c.req, url),
			method: "DELETE"
		});
		logCollector.add({ status: resp.status });
		if (resp.status == 200) {
			logCollector.addMessage(`Successfully used secure-episode-endpoint.`);
			console.log(logCollector.toEndpointLog());
			return c.newResponse(resp.body);
		} else if (resp.status == 404) {
			logCollector.addMessage(`Failed to use secure-episode-endpoint. Episode not found.`);
			console.error(logCollector.toEndpointLog());
			return c.newResponse(resp.body, resp.status);
		} else if (resp.status == 400) {
			logCollector.addMessage(`Failed to use secure-episode-endpoint. Episode published.`);
			console.error(logCollector.toEndpointLog());
			return c.newResponse(resp.body, resp.status);
		} else if (resp.status == 300) {
			logCollector.addMessage(`Failed to use secure-episode-endpoint. Multple podcast/episodes found.`);
			console.error(logCollector.toEndpointLog());
			return c.newResponse(resp.body, resp.status);
		} else {
			logCollector.addMessage(`Failed to use secure-episode-endpoint..`);
			console.error(logCollector.toEndpointLog());
			return c.json({ error: "Error" }, 500);
		}
	}
	logCollector.addMessage("Unauthorised to use deleteEpisode.");
	console.error(logCollector.toEndpointLog());
	return c.json({ error: "Unauthorised" }, 403);
}