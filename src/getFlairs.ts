import { stream } from "hono/streaming";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { LogCollector } from "./LogCollector";

export async function getFlairs(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        let object: R2ObjectBody | null = null;
        try {
            object = await c.env.Content.get("flairs");
        } catch {
            logCollector.add({ message: "Unable to retreve flairs" });
        }
        if (object === null) {
            logCollector.add({ message: logCollector.message ?? "No flares object found" });
            console.error(logCollector.toEndpointLog());
            return new Response("Object Not Found", { status: 404 });
        }
        AddResponseHeaders(c, { etag: object.httpEtag, methods: ["GET", "OPTIONS"] });
        logCollector.add({ message: "Successfully obtained flairs data." });
        console.log(logCollector.toEndpointLog());
        return stream(c, async (stream) => {
            stream.onAbort(() => {
                logCollector.add({ message: 'Aborted!' });
                console.error(logCollector.toEndpointLog());
            });
            await stream.pipe(object.body);
        });
    } else {
        logCollector.add({ message: "Unauthorised to use getFlairs." })
        console.error(logCollector.toEndpointLog());
        return c.json({ message: "Unauthorised" }, 401);
    }
}
