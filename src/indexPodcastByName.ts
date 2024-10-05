import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";

export async function indexPodcastByName(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const name = c.req.param('name');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const authorisation: string = c.req.header("Authorization")!;
        const url = `${c.env.securePodcastIndexEndpoint}/${encodeURIComponent(name)}`;
        const data: any = await c.req.json();
        const body: string = JSON.stringify(data);
        const resp = await fetch(url, {
            headers: {
                'Accept': "*/*",
                'Authorization': authorisation,
                "Content-type": "application/json",
                "Cache-Control": "no-cache",
                "User-Agent": "cult-podcasts-api",
                "Host": new URL(c.env.securePodcastIndexEndpoint).host
            },
            method: "POST",
            body: body
        });
        if (resp.status == 202) {
            console.log(`Successfully used secure-podcast-index-endpoint.`);
            return new Response(resp.body);
        } else if (resp.status == 404) {
            console.log(`Successfully used secure-podcast-index-endpoint. Not Found.`);
            return new Response(resp.body, { status: resp.status });
        } else if (resp.status == 400) {
            console.log(`Successfully used secure-podcast-index-endpoint. Not Performed.`);
            return new Response(resp.body, { status: resp.status });
        } else {
            console.log(`Failed to use secure-podcast-index-endpoint. Response code: '${resp.status}'.`);
            return c.json({ error: "Error" }, 500);
        }
    }
    return c.json({ error: "Unauthorised" }, 403);
}
