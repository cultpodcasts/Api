import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";
import { encodeUrlParameter } from "./encodeUrlParameter";

export async function indexPodcastByName(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    const name = c.req.param('name');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = new URL(`${getEndpoint(Endpoint.podcastIndex, c.env)}/${encodeUrlParameter(name)}`);
        console.log("indexPodcastByName: " + url);
        const data: any = await c.req.json();
        const body: string = JSON.stringify(data);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "POST",
            body: body
        });
        logCollector.add({ status: resp.status });
        if (resp.status == 200) {
            logCollector.addMessage(`Successfully used secure-podcast-index-endpoint.`);
            console.log(logCollector.toEndpointLog());
            return c.newResponse(resp.body);
        } else if (resp.status == 404) {
            logCollector.addMessage(`Successfully used secure-podcast-index-endpoint. Not Found.`);
            console.error(logCollector.toEndpointLog());
            return c.newResponse(resp.body, resp.status);
        } else if (resp.status == 400) {
            logCollector.addMessage(`Successfully used secure-podcast-index-endpoint. Not Performed.`);
            console.error(logCollector.toEndpointLog());
            return c.newResponse(resp.body, resp.status);
        } else {
            logCollector.addMessage(`Failed to use secure-podcast-index-endpoint.`);
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.addMessage("Unauthorised to use indexPodcastByName.");
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
