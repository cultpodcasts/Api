import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";
import { encodeUrlParameter } from "./encodeUrlParameter";

export async function getSubjectByName(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    const name = c.req.param('name');
    AddResponseHeaders(c, {
        omitCacheControlHeader: true,
        methods: ["POST", "GET", "OPTIONS"]
    });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        const url = new URL(`${getEndpoint(Endpoint.subject, c.env)}/${encodeUrlParameter(name)}`);
        console.log("getSubjectByName: " + url);
        const resp = await fetch(url, {
            headers: buildFetchHeaders(c.req, url),
            method: "GET"
        });
        if (resp.status == 200) {
            logCollector.add({ message: `Successfully used secure-subject-endpoint.`, status: resp.status });
            console.log(logCollector.toEndpointLog());
            return c.newResponse(resp.body);
        } else {
            logCollector.add({ message: `Failed to use secure-subject-endpoint.`, status: resp.status });
            console.error(logCollector.toEndpointLog());
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.add({ message: "Unauthorised to use getSubjectByName." });
    console.log(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
