import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";

export async function getOutgoing(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, {
        cacheControlMaxAge: 300,
        methods: ["POST", "GET", "OPTIONS"]
    });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        let url = getEndpoint(Endpoint.outgoingEpisodes, c.env);
        const reqUrl = new URL(c.req.url);
        if (reqUrl.search) {
            url = new URL(url.toString() + reqUrl.search);
        }
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "GET"
        });
        if (resp.status == 200) {
            logCollector.add({ message: `Successfully used secure-episodes-outgoing-endpoint.`, status: resp.status });
            console.log(logCollector.toEndpointLog());
            return c.json(resp.body);
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
