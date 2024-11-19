import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { Endpoint, getEndpoint } from "./endpoints";
import { LogCollector } from "./LogCollector";

export async function publishTerm(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
    const data: any = await c.req.json();
    const body: string = JSON.stringify(data);
    try {
        if (auth0Payload?.permissions && auth0Payload.permissions.includes('admin')) {
            let resp: Response | undefined;
            resp = await fetch(getEndpoint(Endpoint.terms, c.env), {
                headers: buildFetchHeaders(c.req, c.env.secureAdminTermsEndpoint),
                method: "POST",
                body: body
            });
            if (resp.status == 200) {
                logCollector.add({ message: `Successfully used secure secure-term-endpoint.`, status: resp.status });
                console.log(logCollector.toEndpointLog());
                var response = new Response(resp.body);
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else if (resp.status == 409) {
                logCollector.add({ message: `Failure using secure secure-term-endpoint. Conflict`, status: resp.status });
                console.error(logCollector.toEndpointLog());
                var response = new Response(resp.body, { status: resp.status });
                response.headers.set("content-type", "application/json; charset=utf-8");
                return response;
            } else {
                logCollector.add({ message: `Failed to use secure-term-endpoint.`, status: resp.status });
                console.error(logCollector.toEndpointLog());
            }
        }
    } catch {
        logCollector.add({ message: "Error in publishTerm." });
        console.error(logCollector.toEndpointLog());
        return c.json({ error: "An error occurred" }, 500);
    }
    logCollector.add({ message: "Unauthorised to use publishTerm." });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
