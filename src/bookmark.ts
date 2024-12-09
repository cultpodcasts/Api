import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { BookmarkRequest } from "./BookmarkRequest";
import { LogCollector } from "./LogCollector";

export async function bookmark(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload) {
        const bookmarkRequest: BookmarkRequest = await c.req.json<BookmarkRequest>();

        let id: DurableObjectId = c.env.PROFILE_DURABLE_OBJECT.idFromName(new URL(c.req.url).pathname);
        let stub = c.env.PROFILE_DURABLE_OBJECT.get(id);
        let sucesss = await stub.bookmark(bookmarkRequest);
        if (sucesss) {
            return new Response("Success");
        } else {
            return new Response("Error", { status: 400 });
        }
    }
    logCollector.add({ message: `Unauthorised to use profile-object.` });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
