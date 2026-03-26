import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";
import { LogCollector } from "./LogCollector";

export async function publicGetEpisode(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    const id = c.req.param('id');
    AddResponseHeaders(c, {
        methods: ["GET"]
    });
    if (auth0Payload != null) {
        const url = new URL(`${getEndpoint(Endpoint.publicEpisode, c.env)}/${id}`);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "GET"
        });
        logCollector.add({ status: resp.status });
        if (resp.status == 200) {
            logCollector.addMessage(`Successfully used secure-public-episode-endpoint.`);
            console.log(logCollector.toEndpointLog());
            return c.newResponse(resp.body);
        } else {
            logCollector.addMessage(`Failed to use secure-public-episode-endpoint.`);
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.addMessage("Unauthorised to use publicGetEpisode.");
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
