import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";

export async function getOutgoing(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const authorisation: string = c.req.header("Authorization")!;
        console.log(`Using auth header '${authorisation.slice(0, 20)}..'`);
        let url = c.env.secureEpisodesOutgoingEndpoint.toString();
        const reqUrl = new URL(c.req.url);
        if (reqUrl.search) {
            url += reqUrl.search;
        }
        console.log(url);
        const resp = await fetch(url, {
            headers: {
                'Accept': "*/*",
                'Authorization': authorisation,
                "Content-type": "application/json",
                "Cache-Control": "no-cache",
                "User-Agent": "cult-podcasts-api",
                "Host": new URL(c.env.secureEpisodeEndpoint).host
            },
            method: "GET"
        });
        if (resp.status == 200) {
            console.log(`Successfully used secure-episodes-outgoing-endpoint.`);
            return new Response(resp.body);
        } else if (resp.status == 400) {
            console.log(`Bad request to use secure-episodes-outgoing-endpoint. Response code: '${resp.status}'.`);
            return new Response(resp.body, { status: 400 });
        } else {
            console.log(`Failed to use secure-episodes-outgoing-endpoint. Response code: '${resp.status}'.`);
            return c.json({ error: "Error" }, 500);
        }
    }
    return c.json({ error: "Unauthorised" }, 403);
}
