import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { BookmarkRequest } from "./BookmarkRequest";
import { LogCollector } from "./LogCollector";
import { addBookmarkResponse } from "./addBookmarkResponse";

export async function addBookmark(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    const uuidPattern = /^[0-9A-F]{8}[-]?(?:[0-9A-F]{4}[-]?){3}[0-9A-F]{12}$/i;
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload && auth0Payload.sub) {
        const bookmarkRequest: BookmarkRequest = await c.req.json<BookmarkRequest>();
        if (uuidPattern.test(bookmarkRequest.episodeId)) {
            let id: DurableObjectId = c.env.PROFILE_DURABLE_OBJECT.idFromName(auth0Payload.sub);
            let stub = c.env.PROFILE_DURABLE_OBJECT.get(id);
            let result: addBookmarkResponse = await stub.addBookmark(auth0Payload.sub, bookmarkRequest);
            if (result == addBookmarkResponse.created) {
                return c.json({ message: "Success" });
            } else if (result == addBookmarkResponse.duplicateUserBookmark) {
                return c.json({ message: "Bookmark exists" }, { status: 409 });
            } else if (result == addBookmarkResponse.unableToCreateUser) {
                return c.json({ message: "Unable to create user" }, { status: 400 });
            } else if (result == addBookmarkResponse.unableToCreateBookmark) {
                return c.json({ message: "Unable to create bookmark" }, { status: 400 });
            } else {
                return c.json({ message: "Error" }, { status: 400 });
            }
        } else {
            return c.json({ message: "Episode-id does not match recognised uuid pattern." }, { status: 400 });
        }
    }
    logCollector.add({ message: `Unauthorised to use profile-object addBookmark method.` });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}
