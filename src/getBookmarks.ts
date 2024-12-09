import { ProfileInstance } from "./addBookmark";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { LogCollector } from "./LogCollector";
import { getBookmarksResponse } from "./ProfileDurableObject";


export async function getBookmarks(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload) {
        let id: DurableObjectId = c.env.PROFILE_DURABLE_OBJECT.idFromName(ProfileInstance);
        let stub = c.env.PROFILE_DURABLE_OBJECT.get(id);
        let result = await stub.getBookmarks(auth0Payload.sub);
        if (result == getBookmarksResponse.userNotFound) {
            return new Response("User not found", { status: 401 });
        } else if (result == getBookmarksResponse.errorRetrievingBookmarks) {
            return new Response("Could not retrieve bookmarks", { status: 402 });
        }
        return new Response(JSON.stringify(result));
    }
    logCollector.add({ message: `Unauthorised to use profile-object getBookmarks method.` });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);

}
