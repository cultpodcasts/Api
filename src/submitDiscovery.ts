import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";

export async function submitDiscovery(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    const data: any = await c.req.json();
    const body: string = JSON.stringify(data);
    try {
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
            let resp: Response | undefined;
            resp = await fetch(c.env.secureDiscoveryCurationEndpoint, {
                headers: buildFetchHeaders(c.req, c.env.secureDiscoveryCurationEndpoint),
                method: "POST",
                body: body
            });
            if (resp.status == 200) {
                console.log({ message: `Successfully used secure secure-discovery-curation-endpoint.` });
                var response = new Response(resp.body);
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else {
                console.error({ message: `Failed to use secure-discovery-curation-endpoint. Response code: '${resp.status}'.` });
            }
        }
    } catch (error) {
        console.error({ error: error });
        return c.json({ error: "An error occurred" }, 500);
    }
	console.error({ message: "Unauthorised to use submitDiscovery." })
    return c.json({ error: "Unauthorised" }, 403);
}
