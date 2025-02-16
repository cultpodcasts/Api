import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";

export async function submitDiscovery(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    const data: any = await c.req.json();
    const body: string = JSON.stringify(data);
    try {
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
            let resp: Response | undefined;
            const url = getEndpoint(Endpoint.discoveryCuration, c.env);
            resp = await fetch(url, {
                headers: buildFetchHeaders(c.req, url),
                method: "POST",
                body: body
            });
            if (resp.status == 200) {
                logCollector.add({ message: `Successfully used secure secure-discovery-curation-endpoint.`, status: resp.status });
                console.log(logCollector.toEndpointLog());
                return c.newResponse(resp.body);
            } else {
                logCollector.add({ message: `Failed to use secure-discovery-curation-endpoint.`, status: resp.status });
                console.error(logCollector.toEndpointLog());
                return c.json({ error: "Error" }, 500);
            }
        }
    } catch {
        logCollector.add({ message: "Error in submitDiscovery." });
        console.error(logCollector.toEndpointLog());
        return c.json({ error: "An error occurred" }, 500);
    }
    logCollector.add({ message: "Unauthorised to use submitDiscovery." });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
