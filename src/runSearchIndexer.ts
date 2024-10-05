import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./ActionContext";

export async function runSearchIndexer(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    try {
        console.log(auth0Payload.permissions);
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
            const authorisation: string = c.req.header("Authorization")!;
            console.log(`Using auth header '${authorisation.slice(0, 20)}..'`);
            let resp: Response | undefined;
            resp = await fetch(c.env.secureAdminSearchIndexerEndpoint, {
                headers: {
                    'Accept': "*/*",
                    'Authorization': authorisation,
                    "Content-type": "application/json",
                    "Cache-Control": "no-cache",
                    "User-Agent": "cult-podcasts-api",
                    "Host": new URL(c.env.secureAdminSearchIndexerEndpoint).host
                },
                method: "POST",
                body: "{}"
            });
            if (resp.status == 200) {
                console.log(`Successfully used secure secure-admin-search-indexer-endpoint.`);
                var response = new Response(resp.body);
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else if (resp.status == 400) {
                console.log(`Failure using secure secure-admin-search-indexer-endpoint.`);
                var response = new Response(resp.body, { status: 400 });
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else {
                console.log(`Failed to use secure-admin-search-indexer-endpoint. Response code: '${resp.status}'.`);
            }
        }
    } catch (error) {
        return c.json({ error: "An error occurred" }, 500);
    }
    return c.json({ error: "Unauthorised" }, 403);
}
