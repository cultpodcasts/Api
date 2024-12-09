import { ProfileInstance } from "./addBookmark";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { BookmarkRequest } from "./BookmarkRequest";
import { LogCollector } from "./LogCollector";
import { addBookmarkResponse } from "./addBookmarkResponse";


export async function deleteBookmark(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload) {
        const bookmarkRequest: BookmarkRequest = await c.req.json<BookmarkRequest>();

        let id: DurableObjectId = c.env.PROFILE_DURABLE_OBJECT.idFromName(ProfileInstance);
        let stub = c.env.PROFILE_DURABLE_OBJECT.get(id);
        let result: addBookmarkResponse = await stub.deleteBookmark(auth0Payload.sub, bookmarkRequest);
        if (result == deleteBookmarkResponse.deleted) {
            return new Response("Success");
        } else if (result == deleteBookmarkResponse.unableToDeleteBookmark) {
            return new Response("Unable to delete bookmark", { status: 400 });
        } else {
            return new Response("Error", { status: 400 });
        }
    }
    logCollector.add({ message: `Unauthorised to use profile-object deleteBookmark method.` });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
