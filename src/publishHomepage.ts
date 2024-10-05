import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";

export async function publishHomepage(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    try {
        console.log(auth0Payload.permissions);
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
            let resp: Response | undefined;
            console.log(c.env.secureAdminPublishHomepageEndpoint.toString())
            resp = await fetch(c.env.secureAdminPublishHomepageEndpoint, {
                headers: buildFetchHeaders(c.req, c.env.secureAdminPublishHomepageEndpoint),
                method: "POST",
                body: "{}"
            });
            if (resp.status == 200) {
                console.log(`Successfully used secure secure-admin-publish-homepage-endpoint.`);
                var response = new Response(resp.body);
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else if (resp.status == 500) {
                console.log(`Failure using secure secure-admin-publish-homepage-endpoint.`);
                var response = new Response(resp.body, {status: resp.status});
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else {
                console.log(`Failed to use secure-admin-publish-homepage-endpoint. Response code: '${resp.status}'.`);
            }
        }
    } catch (error) {
        return c.json({ error: "An error occurred" }, 500);
    }
    return c.json({ error: "Unauthorised" }, 403);
}
