import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";

export async function getDiscoveryReports(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const authorisation: string = c.req.header("Authorization")!;
        console.log(`Using auth header '${authorisation.slice(0, 20)}..'`);
        const resp = await fetch(c.env.secureDiscoveryCurationEndpoint, {
            headers: {
                'Accept': "*/*",
                'Authorization': authorisation,
                "Content-type": "application/json",
                "Cache-Control": "no-cache",
                "User-Agent": "cult-podcasts-api",
                "Host": new URL(c.env.secureDiscoveryCurationEndpoint).host
            },
            method: "GET"
        });
        if (resp.status == 200) {
            console.log(`Successfully used secure secure-discovery-curation-endpoint.`);

            var response = new Response(resp.body);
            response.headers.set("content-type", "application/json; charset=utf-8");
            return response;
        } else {
            console.log(`Failed to use secure-discovery-curation-endpoint. Response code: '${resp.status}'.`);
        }
    }
    return c.json({ error: "Unauthorised" }, 403);
}
