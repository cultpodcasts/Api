import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";

export async function publish(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const id = c.req.param('id');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });

    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const authorisation: string = c.req.header("Authorization")!;
        const url = `${c.env.secureEpisodePublishEndpoint}/${id}`;
        const data: any = await c.req.json();
        const body: string = JSON.stringify(data);
        const resp = await fetch(url, {
            headers: {
                'Accept': "*/*",
                'Authorization': authorisation,
                "Content-type": "application/json",
                "Cache-Control": "no-cache",
                "User-Agent": "cult-podcasts-api",
                "Host": new URL(c.env.secureEpisodePublishEndpoint).host
            },
            method: "POST",
            body: body
        });
        if (resp.status == 202) {
            console.log(`Successfully used secure-episode-endpoint.`);
            return new Response(resp.body);
        } else {
            console.log(`Failed to use secure-episode-endpoint. Response code: '${resp.status}'.`);
            return c.json({ error: "Error" }, 500);
        }
    }
    return c.json({ error: "Unauthorised" }, 403);
}
