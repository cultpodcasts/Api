import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { BookmarkRequest } from "./BookmarkRequest";
import { LogCollector } from "./LogCollector";
import { bookmarkResponse } from "./ProfileDurableObject";

export async function bookmark(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload) {
        const bookmarkRequest: BookmarkRequest = await c.req.json<BookmarkRequest>();

        let id: DurableObjectId = c.env.PROFILE_DURABLE_OBJECT.idFromName(new URL(c.req.url).pathname);
        let stub = c.env.PROFILE_DURABLE_OBJECT.get(id);
        let result: bookmarkResponse = await stub.bookmark(auth0Payload.sub, bookmarkRequest);
        if (result == bookmarkResponse.created) {
            return new Response("Success");
        } else if (result == bookmarkResponse.duplicateUserBookmark) {
            return new Response("Bookmark exists", { status: 409 })
        } else if (result == bookmarkResponse.unableToCreateUser) {
            return new Response("Unable to create user", { status: 400 });
        } else if (result == bookmarkResponse.unableToCreateBookmark) {
            return new Response("Unable to create bookmark", { status: 400 });
        } else {
            return new Response("Error", { status: 400 });
        }
    }
    logCollector.add({ message: `Unauthorised to use profile-object.` });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
