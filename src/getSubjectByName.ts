import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./ActionContext";

export async function getSubjectByName(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const name = c.req.param('name');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const authorisation: string = c.req.header("Authorization")!;
        console.log(`Using auth header '${authorisation.slice(0, 20)}..'`);
        const url = `${c.env.secureSubjectEndpoint}/${encodeURIComponent(name)}`;
        console.log(url);
        const resp = await fetch(url, {
            headers: {
                'Accept': "*/*",
                'Authorization': authorisation,
                "Content-type": "application/json",
                "Cache-Control": "no-cache",
                "User-Agent": "cult-podcasts-api",
                "Host": new URL(c.env.secureSubjectEndpoint).host
            },
            method: "GET"
        });
        if (resp.status == 200) {
            console.log(`Successfully used secure-subject-endpoint.`);

            return new Response(resp.body);
        } else {
            console.log(`Failed to use secure-subject-endpoint. Response code: '${resp.status}'.`);
            return c.json({ error: "Error" }, 500);
        }
    }
    return c.json({ error: "Unauthorised" }, 403);
}
