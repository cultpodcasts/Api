import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";

export async function renamePodcast(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const podcastName = c.req.param('podcastName');
    const newName = c.req.param('newName');
    AddResponseHeaders(c, { methods: ["PATCH", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = `${c.env.securePodcastEndpoint}/${podcastName}/name/${newName}`;
        const data: any = await c.req.json();
        const body: string = JSON.stringify(data);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, c.env.securePodcastEndpoint),
            method: "PATCH",
            body: body
        });
        if (resp.status == 200) {
            console.log(`Successfully used secure-podcast-endpoint to rename podcast.`);
            return new Response(resp.body);
        } else if (resp.status == 404) {
            console.log(`Unable to find podcast to rename podcast.`);
            return new Response(resp.body, { status: resp.status });
        } else {
            console.log(`Failed to use secure-podcast-endpoint to rename podcast. Response code: '${resp.status}'.`);
            return c.json({ error: "Error" }, 500);
        }
    }
    return c.json({ error: "Unauthorised" }, 403);
}
