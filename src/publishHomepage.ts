import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";

export async function publishHomepage(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    try {
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
            let resp: Response | undefined;
            const url = getEndpoint(Endpoint.publishHomepage, c.env);
            resp = await fetch(url, {
                headers: buildFetchHeaders(c.req, url),
                method: "POST",
                body: "{}"
            });
            if (resp.status == 200) {
                logCollector.add({ message: `Successfully used secure secure-admin-publish-homepage-endpoint.`, status: resp.status });
                console.log(logCollector.toEndpointLog());
                return c.json(resp.body);
            } else if (resp.status == 500) {
                logCollector.add({ message: `Failure using secure secure-admin-publish-homepage-endpoint.`, status: resp.status });
                console.error(logCollector.toEndpointLog());
                return resp;
            } else {
                logCollector.add({ message: `Failed to use secure-admin-publish-homepage-endpoint.`, status: resp.status });
                console.error(logCollector.toEndpointLog());
            }
        }
    } catch {
        logCollector.add({ message: "Error in publishHomepage." });
        console.error(logCollector.toEndpointLog());
        return c.json({ error: "An error occurred" }, 500);
    }
    logCollector.add({ message: "Unauthorised to use publishHomepage." });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
