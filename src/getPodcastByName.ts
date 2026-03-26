import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";
import { encodeUrlParameter } from "./encodeUrlParameter";

export async function getPodcastByName(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    const name = c.req.param('name');
    AddResponseHeaders(c, {
        omitCacheControlHeader: true,
        methods: ["POST", "GET", "OPTIONS"]
    });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = new URL(`${getEndpoint(Endpoint.podcast, c.env)}/${encodeUrlParameter(name)}`);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "GET"
        });
        logCollector.add({ status: resp.status });
        if (resp.status == 200) {
            logCollector.addMessage(`Successfully used secure-podcast-endpoint.`);
            console.log(logCollector.toEndpointLog());
            return c.newResponse(resp.body);
        } else if (resp.status == 404) {
            logCollector.addMessage(`Unable to find podcast.`);
            console.error(logCollector.toEndpointLog());
            return c.newResponse(resp.body, resp.status);
        } else if (resp.status == 409) {
            logCollector.addMessage(`Multiple podcasts found.`);
            console.error(logCollector.toEndpointLog());
            return c.newResponse(resp.body, resp.status);
        } else {
            logCollector.addMessage(`Failed to use secure-podcast-endpoint.`);
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.addMessage("Unauthorised to use getPodcastByName.");
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}