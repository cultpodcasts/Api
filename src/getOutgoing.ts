import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { Endpoint, getEndpoint } from "./endpoints";

export async function getOutgoing(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        let url = getEndpoint(Endpoint.outgoingEpisodes, c.env).toString();
        const reqUrl = new URL(c.req.url);
        if (reqUrl.search) {
            url += reqUrl.search;
        }
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, c.env.secureEpisodeEndpoint),
            method: "GET"
        });
        if (resp.status == 200) {
            logCollector.add({ message: `Successfully used secure-episodes-outgoing-endpoint.`, status: resp.status });
            console.log(logCollector.toEndpointLog());
            return new Response(resp.body);
        } else if (resp.status == 400) {
            logCollector.add({ message: `Bad request to use secure-episodes-outgoing-endpoint.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return new Response(resp.body, { status: 400 });
        } else {
            logCollector.add({ message: `Failed to use secure-episodes-outgoing-endpoint.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.add({ message: "Unauthorised to use getOutgoing." })
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
