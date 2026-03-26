import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { encodeUrlParameter } from "./encodeUrlParameter";
import { Endpoint } from "./Endpoint";
import { getEndpoint } from "./endpoints";
import { LogCollector } from "./LogCollector";

export async function getPodcastByNameAndEpisodeId(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    const name = c.req.param('name');
    const id = c.req.param('id');
    AddResponseHeaders(c, {
        omitCacheControlHeader: true,
        methods: ["POST", "GET", "OPTIONS"]
    });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = new URL(`${getEndpoint(Endpoint.podcast, c.env)}/${encodeUrlParameter(name)}/${encodeUrlParameter(id)}`);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "GET"
        });
        logCollector.add({ status: resp.status });
        if (resp.status == 200) {
            logCollector.addMessage(`Successfully used secure-podcast-endpoint with episode-id.`);
            console.log(logCollector.toEndpointLog());
            return c.newResponse(resp.body);
        } else if (resp.status == 404) {
            logCollector.addMessage(`Unable to find podcast with episode-id.`);
            console.error(logCollector.toEndpointLog());
            return c.newResponse(resp.body, resp.status);
        } else if (resp.status == 409) {
            logCollector.addMessage(`Multiple podcasts found with episode-id.`);
            console.error(logCollector.toEndpointLog());
            return c.newResponse(resp.body, resp.status);
        } else {
            logCollector.addMessage(`Failed to use secure-podcast-endpoint with episode-id.`);
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.addMessage("Unauthorised to use getPodcastByName with episode-id.");
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
