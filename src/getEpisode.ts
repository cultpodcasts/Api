import { AddResponseHeaders } from './AddResponseHeaders';
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from './buildFetchHeaders';

export async function getEpisode(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const id = c.req.param('id');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS", "DELETE"] });

    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const authorisation: string = c.req.header("Authorization")!;
        const url = `${c.env.secureEpisodeEndpoint}/${id}`;
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, c.env.secureEpisodeEndpoint),
            method: "GET"
        });
        if (resp.status == 200) {
            console.log({ message: `Successfully used secure-episode-endpoint.`, status: resp.status });
            return new Response(resp.body);
        } else {
            console.error({ message: `Failed to use secure-episode-endpoint.`, status: resp.status });
            return c.json({ error: "Error" }, 500);
        }
    }
    console.error({ message: "Unauthorised to use getEpisode." })
    return c.json({ error: "Unauthorised" }, 403);
}
