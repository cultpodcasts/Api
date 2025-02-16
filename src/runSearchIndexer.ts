import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";

export async function runSearchIndexer(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    try {
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
            let resp: Response | undefined;
            const url = getEndpoint(Endpoint.searchIndexer, c.env);
            resp = await fetch(url, {
                headers: buildFetchHeaders(c.req, url),
                method: "POST",
                body: "{}"
            });
            if (resp.status == 200) {
                logCollector.add({ message: `Successfully used secure secure-admin-search-indexer-endpoint.`, status: resp.status });
                console.log(logCollector.toEndpointLog());
                return c.newResponse(resp.body);
            } else if (resp.status == 400) {
                logCollector.add({ message: `Failure using secure secure-admin-search-indexer-endpoint.`, status: resp.status });
                console.error(logCollector.toEndpointLog());
                return c.newResponse(resp.body, resp.status);
            } else {
                logCollector.add({ message: `Failed to use secure-admin-search-indexer-endpoint.`, status: resp.status });
                console.error(logCollector.toEndpointLog());
                return c.newResponse(resp.body, 500);
            }
        }
    } catch {
        logCollector.add({ message: "Error in runSearchIndexer." });
        console.error(logCollector.toEndpointLog());
        return c.json({ error: "An error occurred" }, 500);
    }
    logCollector.add({ message: "Unauthorised to use runSearchIndexer." });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
