import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";

export async function publish(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const id = c.req.param('id');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });

    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = `${c.env.secureEpisodePublishEndpoint}/${id}`;
        const data: any = await c.req.json();
        const body: string = JSON.stringify(data);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, c.env.secureEpisodePublishEndpoint),
            method: "POST",
            body: body
        });
        if (resp.status == 202) {
            console.log({ message: `Successfully used secure-episode-endpoint.`, status: resp.status });
            return new Response(resp.body);
        } else {
            console.error({ message: `Failed to use secure-episode-endpoint.`, status: resp.status });
            return c.json({ error: "Error" }, 500);
        }
    }
    console.error({ message: "Unauthorised to use publish." })
    return c.json({ error: "Unauthorised" }, 403);
}
