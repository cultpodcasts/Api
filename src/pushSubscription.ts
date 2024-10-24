import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";


export async function pushSubscription(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload && auth0Payload.permissions.includes('admin')) {
        const url = `${c.env.securePushSubscriptionEndpoint}`;
        const data: any = await c.req.json();
        const body: string = JSON.stringify(data);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, c.env.securePushSubscriptionEndpoint),
            method: "POST",
            body: body
        });
        if (resp.status == 200) {
            console.log({ message: `Successfully used secure-push-subscription-endpoint.`, status: resp.status });
            return new Response(resp.body, { status: resp.status });
        } else {
            console.error({ message: `Failed to use secure-push-subscription-endpoint.`, status: resp.status });
            return c.json({ error: "Error" }, 500);
        }
    }
    console.error({ message: `Unauthorised to use pushSubscription.` });
    return c.json({ error: "Unauthorised" }, 403);
}
