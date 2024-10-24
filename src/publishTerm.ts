import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";


export async function publishTerm(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
    const data: any = await c.req.json();
    const body: string = JSON.stringify(data);
    try {
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
            let resp: Response | undefined;
            resp = await fetch(c.env.secureAdminTermsEndpoint, {
                headers: buildFetchHeaders(c.req, c.env.secureAdminTermsEndpoint),
                method: "POST",
                body: body
            });
            if (resp.status == 200) {
                console.log({ message: `Successfully used secure secure-term-endpoint.`, status: resp.status });
                var response = new Response(resp.body);
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else if (resp.status == 409) {
                console.error({ message: `Failure using secure secure-term-endpoint. Conflict`, status: resp.status });
                var response = new Response(resp.body, { status: resp.status });
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else {
                console.error({ message: `Failed to use secure-term-endpoint.`, status: resp.status });
            }
        }
    } catch (error) {
        console.error({ message: "Error in publishTerm.", error: error });
        return c.json({ error: "An error occurred" }, 500);
    }
    console.error({ message: "Unauthorised to use publishTerm." })
    return c.json({ error: "Unauthorised" }, 403);
}
