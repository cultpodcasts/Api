import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";
import { LogCollector } from "./LogCollector";
import { StatusCode } from "hono/utils/http-status";

export async function getDiscoverySchedule(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["GET", "PUT", "OPTIONS"] });
    try {
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
            const url = getEndpoint(Endpoint.discoverySchedule, c.env);
            const resp = await fetch(url, {
                headers: buildFetchHeaders(c.req, url),
                method: "GET"
            });
            logCollector.add({ status: resp.status });
            if (resp.status == 200) {
                logCollector.addMessage(`Successfully used discovery-schedule GET.`);
                console.log(logCollector.toEndpointLog());
                return c.newResponse(resp.body);
            }
            logCollector.addMessage(`Failed discovery-schedule GET.`);
            console.error(logCollector.toEndpointLog());
            return c.newResponse(resp.body, resp.status as StatusCode);
        }
    } catch {
        logCollector.addMessage("Error in getDiscoverySchedule.");
        console.error(logCollector.toEndpointLog());
        return c.json({ error: "An error occurred" }, 500);
    }
    logCollector.addMessage("Unauthorised to use getDiscoverySchedule.");
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}

export async function putDiscoverySchedule(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["GET", "PUT", "OPTIONS"] });
    const data: any = await c.req.json();
    const body: string = JSON.stringify(data);
    try {
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
            const url = getEndpoint(Endpoint.discoverySchedule, c.env);
            const resp = await fetch(url, {
                headers: buildFetchHeaders(c.req, url),
                method: "PUT",
                body
            });
            logCollector.add({ status: resp.status });
            if (resp.status == 200) {
                logCollector.addMessage(`Successfully used discovery-schedule PUT.`);
                console.log(logCollector.toEndpointLog());
                return c.newResponse(resp.body);
            }
            logCollector.addMessage(`Failed discovery-schedule PUT.`);
            console.error(logCollector.toEndpointLog());
            return c.newResponse(resp.body, resp.status as StatusCode);
        }
    } catch {
        logCollector.addMessage("Error in putDiscoverySchedule.");
        console.error(logCollector.toEndpointLog());
        return c.json({ error: "An error occurred" }, 500);
    }
    logCollector.addMessage("Unauthorised to use putDiscoverySchedule.");
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
