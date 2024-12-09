import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { BookmarkRequest } from "./BookmarkRequest";
import { LogCollector } from "./LogCollector";
import { addBookmarkResponse } from "./ProfileDurableObject";

export const ProfileInstance= "profile";

export async function addBookmark(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload) {
        const bookmarkRequest: BookmarkRequest = await c.req.json<BookmarkRequest>();

        let id: DurableObjectId = c.env.PROFILE_DURABLE_OBJECT.idFromName(ProfileInstance);
        let stub = c.env.PROFILE_DURABLE_OBJECT.get(id);
        let result: addBookmarkResponse = await stub.bookmark(auth0Payload.sub, bookmarkRequest);
        if (result == addBookmarkResponse.created) {
            return new Response("Success");
        } else if (result == addBookmarkResponse.duplicateUserBookmark) {
            return new Response("Bookmark exists", { status: 409 });
        } else if (result == addBookmarkResponse.unableToCreateUser) {
            return new Response("Unable to create user", { status: 400 });
        } else if (result == addBookmarkResponse.unableToCreateBookmark) {
            return new Response("Unable to create bookmark", { status: 400 });
        } else {
            return new Response("Error", { status: 400 });
        }
    }
    logCollector.add({ message: `Unauthorised to use profile-object bookmark method.` });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
