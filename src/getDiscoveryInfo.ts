import { stream } from "hono/streaming";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { LogCollector } from "./LogCollector";

export async function getDiscoveryInfo(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        let object: R2ObjectBody | null = null;
        try {
            object = await c.env.Content.get("discovery-info");
        } catch {
            logCollector.add({ message: "Unable to retrieve discovery-info" });
        }
        if (object === null) {
            logCollector.add({ message: logCollector.message ?? "No discovery-info object found" });
            console.error(logCollector.toEndpointLog());
            return c.notFound();
        }
        logCollector.addMessage(`Object found with uploaded-date: ${object.uploaded}`);
        object.writeHttpMetadata(c.res.headers);
        AddResponseHeaders(c, {
            cacheControlMaxAge: 60,
            etag: object.httpEtag,
            methods: ["GET", "OPTIONS"]
        });
        logCollector.addMessage("Successfully obtained discovery-info data.");
        console.log(logCollector.toEndpointLog());
        return stream(c, async (stream) => {
            stream.onAbort(() => {
                logCollector.add({ message: 'Aborted!' });
                console.error(logCollector.toEndpointLog());
            });
            await stream.pipe(object.body);
        });
    } else {
        logCollector.add({ message: "Unauthorised to use getDiscoveryInfo." });
        console.error(logCollector.toEndpointLog());
        return c.json({ message: "Unauthorised" }, 401);
    }

}
