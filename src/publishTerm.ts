import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";
import { LogCollector } from "./LogCollector";

export async function publishTerm(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
    const data: any = await c.req.json();
    const body: string = JSON.stringify(data);
    try {
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
            let resp: Response | undefined;
            const url = getEndpoint(Endpoint.terms, c.env);
            resp = await fetch(url, {
                headers: buildFetchHeaders(c.req, url),
                method: "POST",
                body: body
            });
            logCollector.add({ status: resp.status });
            if (resp.status == 200) {
                logCollector.addMessage(`Successfully used secure secure-term-endpoint.`);
                console.log(logCollector.toEndpointLog());
                return c.newResponse(resp.body);
            } else if (resp.status == 409) {
                logCollector.addMessage(`Failure using secure secure-term-endpoint. Conflict`);
                console.error(logCollector.toEndpointLog());
                return c.newResponse(resp.body, resp.status);
            } else {
                logCollector.addMessage(`Failed to use secure-term-endpoint.`);
                console.error(logCollector.toEndpointLog());
            }
        }
    } catch {
        logCollector.addMessage("Error in publishTerm.");
        console.error(logCollector.toEndpointLog());
        return c.json({ error: "An error occurred" }, 500);
    }
    logCollector.addMessage("Unauthorised to use publishTerm.");
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
