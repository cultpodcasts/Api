import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";

export async function renamePodcast(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
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
            console.log({ message: `Successfully used secure-podcast-endpoint to rename podcast.` });
            return new Response(resp.body);
        } else if (resp.status == 400) {
            console.error({ message: `Unable to find podcast to rename podcast.` });
            return new Response(resp.body, { status: resp.status });
        } else if (resp.status == 404) {
            console.error({ message: `Unable to find podcast to rename podcast. Podccast not found.` });
            return new Response(resp.body, { status: resp.status });
        } else if (resp.status == 409) {
            console.error({ message: `Unable to find podcast to rename podcast. Podcast exists with new-name.` });
            return new Response(resp.body, { status: resp.status });
        } else {
            console.error({ message: `Failed to use secure-podcast-endpoint to rename podcast. Response code: '${resp.status}'.` });
            return c.json({ error: "Error" }, 500);
        }
    }
	console.error({ message: "Unauthorised to use renamePodcast." })
    return c.json({ error: "Unauthorised" }, 403);
}
