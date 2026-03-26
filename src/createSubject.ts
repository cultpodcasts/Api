import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";

export async function createSubject(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = getEndpoint(Endpoint.subject, c.env);
        const data: any = await c.req.json();
        const body: string = JSON.stringify(data);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "PUT",
            body: body
        });
            logCollector.add({ status: resp.status });
        if (resp.status == 202) {
            logCollector.addMessage(`Successfully used secure-subject-endpoint.`);
            console.log(logCollector.toEndpointLog());
            return c.newResponse(resp.body, resp.status);
        } else if (resp.status == 409) {
            logCollector.addMessage(`Conflict reported on secure-subject-endpoint.`);
            console.error(logCollector.toEndpointLog());
            return c.newResponse(resp.body, resp.status);
        } else {
            logCollector.addMessage(`Failed to use secure-subject-endpoint.`);
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.addMessage(`Unauthorised to use createSubject.`);
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
