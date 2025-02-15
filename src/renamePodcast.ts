import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { encodeUrlParameter } from "./encodeUrlParameter";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";
import { LogCollector } from "./LogCollector";

export async function renamePodcast(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    const podcastName = c.req.param('name');
    const newName = c.req.param('newName');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
        const url = new URL(`${getEndpoint(Endpoint.podcast, c.env)}/name/${encodeUrlParameter(podcastName)}`);
        console.log("renamePodcast: " + url);
        const data: any = await c.req.json();
        const body: string = JSON.stringify(data);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "POST",
            body: body
        });
        if (resp.status == 200) {
            logCollector.add({ message: `Successfully used secure-podcast-endpoint to rename podcast.`, status: resp.status });
            console.log(logCollector.toEndpointLog());
            return c.json(resp.json());
        } else if (resp.status == 400) {
            logCollector.add({ message: `Unable to find podcast to rename podcast.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return c.text("Bad Request", resp.status);
        } else if (resp.status == 404) {
            logCollector.add({ message: `Unable to find podcast to rename podcast. Podccast not found.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            c.notFound();
        } else if (resp.status == 409) {
            logCollector.add({ message: `Unable to find podcast to rename podcast. Podcast exists with new-name.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return c.text("Conflict", resp.status);
        } else {
            logCollector.add({ message: `Failed to use secure-podcast-endpoint to rename podcast.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return resp;
        }
    }
    logCollector.add({ message: "Unauthorised to use renamePodcast." });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
