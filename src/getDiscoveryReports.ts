import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";

export async function getDiscoveryReports(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, {
        cacheControlMaxAge: 60,
        methods: ["POST", "GET", "OPTIONS"]
    });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = getEndpoint(Endpoint.discoveryCuration, c.env);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "GET"
        });
        if (resp.status == 200) {
            logCollector.add({ message: `Successfully used secure secure-discovery-curation-endpoint.`, status: resp.status });
            console.log(logCollector.toEndpointLog());
            return c.json(resp.json());
        } else {
            logCollector.add({ message: `Failed to use secure-discovery-curation-endpoint.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
        }
    }
    logCollector.add({ message: "Unauthorised to use getDiscoveryReports." });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
