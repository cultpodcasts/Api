import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";

export async function getPodcastByName(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const name = c.req.param('name');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = `${c.env.securePodcastEndpoint}/${encodeURIComponent(name)}`;
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, c.env.securePodcastEndpoint),
            method: "GET"
        });
        if (resp.status == 200) {
            console.log({ message: `Successfully used secure-podcast-endpoint.`, status: resp.status });
            return new Response(resp.body);
        } else if (resp.status == 404) {
            console.error({ message: `Unable to find podcast.`, status: resp.status });
            return new Response(resp.body, { status: resp.status });
        } else {
            console.error({ message: `Failed to use secure-podcast-endpoint.`, status: resp.status });
            return c.json({ error: "Error" }, 500);
        }
    }
    console.error({ message: "Unauthorised to use getPodcastByName." })
    return c.json({ error: "Unauthorised" }, 403);
}
