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
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE"] });

    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = new URL(`${getEndpoint(Endpoint.episode, c.env)}/${id}`);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "GET"
        });
        if (resp.status == 200) {
            logCollector.add({ message: `Successfully used secure-episode-endpoint.`, status: resp.status });
            console.log(logCollector.toEndpointLog());
            return new Response(resp.body);
        } else if (resp.status == 404) {
            logCollector.add({ message: `Successfully used secure-episode-endpoint. Episode not found.`, status: resp.status });
            console.log(logCollector.toEndpointLog());
            return new Response(resp.body, { status: resp.status });
        } else {
            logCollector.add({ message: `Failed to use secure-episode-endpoint.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.add({ message: "Unauthorised to use getEpisode." });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
