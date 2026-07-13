import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { LogCollector } from "./LogCollector";
import { getBookmarksResponse } from "./getBookmarksResponse";

export async function getBookmarks(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, {
        omitCacheControlHeader: true,
        methods: ["POST", "GET", "OPTIONS"]
    });
    if (auth0Payload?.sub) {
        let id: DurableObjectId = c.env.PROFILE_DURABLE_OBJECT.idFromName(auth0Payload.sub);
        let stub = c.env.PROFILE_DURABLE_OBJECT.get(id);
        let result = await stub.getBookmarks(auth0Payload.sub);
        if (result == getBookmarksResponse.userNotFound) {
            return c.json([], 200);
        } else if (result == getBookmarksResponse.errorRetrievingBookmarks) {
            return c.json({ message: "Could not retrieve bookmarks" }, 500);
        }
        // Copy out of any RPC stub array so JSON serializes as a real array.
        return c.json(Array.isArray(result) ? [...result] : result);
    }
    logCollector.addMessage(`Unauthorised to use profile-object getBookmarks method.`);
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);

}
