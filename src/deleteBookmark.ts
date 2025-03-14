import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { LogCollector } from "./LogCollector";
import { deleteBookmarkResponse } from "./deleteBookmarkResponse";
import { uuidPattern } from "./uuidPattern";

export async function deleteBookmark(c: Auth0ActionContext): Promise<Response> {
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    AddResponseHeaders(c, { methods: ["POST", "DELETE", "OPTIONS"] });
    if (auth0Payload) {
        const episodeId = c.req.param('episodeId');
        if (uuidPattern.test(episodeId)) {
            let id: DurableObjectId = c.env.PROFILE_DURABLE_OBJECT.idFromName(auth0Payload.sub);
            let stub = c.env.PROFILE_DURABLE_OBJECT.get(id);
            let result: deleteBookmarkResponse = await stub.deleteBookmark(auth0Payload.sub, episodeId);
            logCollector.addMessage(`result= ${result}`);
            if (result == deleteBookmarkResponse.deleted) {
                console.log(logCollector.toEndpointLog());
                return c.json({ message: "Success" });
            } else {
                console.error(logCollector.toEndpointLog());
                if (result == deleteBookmarkResponse.unableToDeleteBookmark) {
                    return c.json({ message: "Unable to delete bookmark" }, { status: 400 });
                } else {
                    return c.json({ message: "Error" }, { status: 400 });
                }
            }
        } else {
            return c.json({ message: "Episode-id does not match recognised uuid pattern." }, { status: 400 });
        }
    }
    logCollector.add({ message: `Unauthorised to use profile-object deleteBookmark method.` });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}