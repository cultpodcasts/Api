import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";

export async function indexPodcastByName(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const name = c.req.param('name');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = `${c.env.securePodcastIndexEndpoint}/${encodeURIComponent(name)}`;
        const data: any = await c.req.json();
        const body: string = JSON.stringify(data);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, c.env.securePodcastIndexEndpoint),
            method: "POST",
            body: body
        });
        if (resp.status == 200) {
            console.log({ message: `Successfully used secure-podcast-index-endpoint.`, status: resp.status });
            return new Response(resp.body);
        } else if (resp.status == 404) {
            console.error({ message: `Successfully used secure-podcast-index-endpoint. Not Found.`, status: resp.status });
            return new Response(resp.body, { status: resp.status });
        } else if (resp.status == 400) {
            console.error({ message: `Successfully used secure-podcast-index-endpoint. Not Performed.`, status: resp.status });
            return new Response(resp.body, { status: resp.status });
        } else {
            console.error({ message: `Failed to use secure-podcast-index-endpoint.`, status: resp.status });
            return c.json({ error: "Error" }, 500);
        }
    }
    console.error({ message: "Unauthorised to use indexPodcastByName." })
    return c.json({ error: "Unauthorised" }, 403);
}
