import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";

export async function runSearchIndexer(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    try {
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
            let resp: Response | undefined;
            resp = await fetch(c.env.secureAdminSearchIndexerEndpoint, {
                headers: buildFetchHeaders(c.req, c.env.secureAdminSearchIndexerEndpoint),
                method: "POST",
                body: "{}"
            });
            if (resp.status == 200) {
                logCollector.add({ message: `Successfully used secure secure-admin-search-indexer-endpoint.`, status: resp.status });
                console.log(logCollector.toEndpointLog());
                var response = new Response(resp.body);
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else if (resp.status == 400) {
                logCollector.add({ message: `Failure using secure secure-admin-search-indexer-endpoint.`, status: resp.status });
                console.error(logCollector.toEndpointLog());
                var response = new Response(resp.body, { status: 400 });
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else {
                logCollector.add({ message: `Failed to use secure-admin-search-indexer-endpoint.`, status: resp.status });
                console.error(logCollector.toEndpointLog());
                var response = new Response(resp.body, { status: 500 });
                return response;
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
