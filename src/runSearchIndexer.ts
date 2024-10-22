import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";

export async function runSearchIndexer(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    try {
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
            let resp: Response | undefined;
            resp = await fetch(c.env.secureAdminSearchIndexerEndpoint, {
                headers: buildFetchHeaders(c.req, c.env.secureAdminSearchIndexerEndpoint),
                method: "POST",
                body: "{}"
            });
            if (resp.status == 200) {
                console.log({ message: `Successfully used secure secure-admin-search-indexer-endpoint.` });
                var response = new Response(resp.body);
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else if (resp.status == 400) {
                console.error({ message: `Failure using secure secure-admin-search-indexer-endpoint.` });
                var response = new Response(resp.body, { status: 400 });
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else {
                console.error({ message: `Failed to use secure-admin-search-indexer-endpoint. Response code: '${resp.status}'.` });
            }
        }
    } catch (error) {
        console.error({ error: error });
        return c.json({ error: "An error occurred" }, 500);
    }
	console.error({ message: "Unauthorised to use runSearchIndexer." })
    return c.json({ error: "Unauthorised" }, 403);
}
