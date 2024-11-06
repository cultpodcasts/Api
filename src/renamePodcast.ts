import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";

export async function renamePodcast(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    const podcastName = c.req.param('name');
    const newName = c.req.param('newName');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
        const url = `${c.env.securePodcastEndpoint}/name/${podcastName}`;
        const data: any = await c.req.json();
        const body: string = JSON.stringify(data);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, c.env.securePodcastEndpoint),
            method: "POST",
            body: body
        });
        if (resp.status == 200) {
            logCollector.add({ message: `Successfully used secure-podcast-endpoint to rename podcast.`, status: resp.status });
            console.log(logCollector.toEndpointLog());
            return new Response(resp.body);
        } else if (resp.status == 400) {
            logCollector.add({ message: `Unable to find podcast to rename podcast.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return new Response(resp.body, { status: resp.status });
        } else if (resp.status == 404) {
            logCollector.add({ message: `Unable to find podcast to rename podcast. Podccast not found.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return new Response(resp.body, { status: resp.status });
        } else if (resp.status == 409) {
            logCollector.add({ message: `Unable to find podcast to rename podcast. Podcast exists with new-name.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return new Response(resp.body, { status: resp.status });
        } else {
            logCollector.add({ message: `Failed to use secure-podcast-endpoint to rename podcast.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.add({ message: "Unauthorised to use renamePodcast." });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
