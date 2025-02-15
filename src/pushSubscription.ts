import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";
import { LogCollector } from "./LogCollector";

export async function pushSubscription(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload && auth0Payload.permissions.includes('admin')) {
        const url = getEndpoint(Endpoint.pushSubscriptions, c.env);
        const data: any = await c.req.json();
        const body: string = JSON.stringify(data);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "POST",
            body: body
        });
        if (resp.status == 200) {
            logCollector.add({ message: `Successfully used secure-push-subscription-endpoint.`, status: resp.status });
            console.log(logCollector.toEndpointLog());
            return c.text("OK", resp.status);
        } else {
            logCollector.add({ message: `Failed to use secure-push-subscription-endpoint.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.add({ message: `Unauthorised to use pushSubscription.` });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
