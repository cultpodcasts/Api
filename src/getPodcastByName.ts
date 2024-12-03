import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { Endpoint, getEndpoint } from "./endpoints";
import { encodeUrlParameter } from "./encodeUrlParameter";

export async function getPodcastByName(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    const name = c.req.param('name');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = `${getEndpoint(Endpoint.podcast, c.env)}/${encodeUrlParameter(name)}`;
        console.log("get-podcast: " + url);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, c.env.securePodcastEndpoint),
            method: "GET"
        });
        if (resp.status == 200) {
            logCollector.add({ message: `Successfully used secure-podcast-endpoint.`, status: resp.status });
            console.log(logCollector.toEndpointLog());
            return new Response(resp.body);
        } else if (resp.status == 404) {
            logCollector.add({ message: `Unable to find podcast.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return new Response(resp.body, { status: resp.status });
        } else if (resp.status == 409) {
            logCollector.add({ message: `Multiple podcasts found.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return new Response(resp.body, { status: resp.status });
        } else {
            logCollector.add({ message: `Failed to use secure-podcast-endpoint.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.add({ message: "Unauthorised to use getPodcastByName." });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
