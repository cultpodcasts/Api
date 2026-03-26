import { AddResponseHeaders } from './AddResponseHeaders';
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from './buildFetchHeaders';
import { LogCollector } from './LogCollector';
import { getEndpoint } from './endpoints';
import { Endpoint } from "./Endpoint";

export async function getEpisode(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    const id = c.req.param('id');
    AddResponseHeaders(c, {
        omitCacheControlHeader: true,
        methods: ["POST", "GET", "OPTIONS", "DELETE"]
    });

    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = new URL(`${getEndpoint(Endpoint.episode, c.env)}/${id}`);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "GET"
        });
        logCollector.add({ status: resp.status });
        if (resp.status == 200) {
            logCollector.addMessage(`Successfully used secure-episode-endpoint.`);
            console.log(logCollector.toEndpointLog());
            return c.newResponse(resp.body);
        } else if (resp.status == 404) {
            logCollector.addMessage(`Successfully used secure-episode-endpoint. Episode not found.`);
            console.log(logCollector.toEndpointLog());
            return c.newResponse(resp.body, resp.status);
        } else {
            logCollector.addMessage(`Failed to use secure-episode-endpoint.`);
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.addMessage("Unauthorised to use getEpisode.");
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}

export async function getPodcastEpisode(c:Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    const podcastName = c.req.param('podcastName');
    const episodeId = c.req.param('episodeId');
    AddResponseHeaders(c, {
        omitCacheControlHeader: true,
        methods: ["POST", "GET", "OPTIONS", "DELETE"]
    });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = new URL(`${getEndpoint(Endpoint.episode, c.env)}/${podcastName}/${episodeId}`);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "GET"
        });
        logCollector.add({ status: resp.status });
        if (resp.status == 200) {
            logCollector.addMessage(`Successfully used secure-episode-endpoint.`);
            console.log(logCollector.toEndpointLog());
            return c.newResponse(resp.body);
        } else if (resp.status == 404) {
            logCollector.addMessage(`Successfully used secure-episode-endpoint. Episode not found.`);
            console.log(logCollector.toEndpointLog());
            return c.newResponse(resp.body, resp.status);
        } else {
            logCollector.addMessage(`Failed to use secure-episode-endpoint.`);
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.addMessage("Unauthorised to use getEpisode.");
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
