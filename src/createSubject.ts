import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";

export async function createSubject(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = `${c.env.secureSubjectEndpoint}`;
        const data: any = await c.req.json();
        const body: string = JSON.stringify(data);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, c.env.secureSubjectEndpoint),
            method: "PUT",
            body: body
        });
        if (resp.status == 202) {
            console.log({ message: `Successfully used secure-subject-endpoint.` });
            return new Response(resp.body, { status: resp.status });
        } else if (resp.status == 409) {
            console.error({ message: `Conflict reported on secure-subject-endpoint.` });
            return new Response(resp.body, { status: resp.status });
        } else {
            console.error({ message: `Failed to use secure-subject-endpoint. Response code: '${resp.status}'.` });
            return c.json({ error: "Error" }, 500);
        }
    }
    console.error({ message: `Unauthorised to use createSubject.` });
    return c.json({ error: "Unauthorised" }, 403);
}
