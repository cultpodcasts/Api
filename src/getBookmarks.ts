import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { LogCollector } from "./LogCollector";
import { getBookmarksResponse } from "./getBookmarksResponse";

export async function getBookmarks(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "getBookmarks" });
	AddResponseHeaders(c, { omitCacheControlHeader: true, methods: ["POST", "GET", "OPTIONS"] });
	if (auth0Payload?.sub) {
		let id: DurableObjectId = c.env.PROFILE_DURABLE_OBJECT.idFromName(auth0Payload.sub);
		let stub = c.env.PROFILE_DURABLE_OBJECT.get(id);
		let result = await stub.getBookmarks(auth0Payload.sub);
		if (result == getBookmarksResponse.userNotFound) {
			logCollector.emit({ event: "bookmarks.empty", outcome: "success" });
			return c.json([], 200);
		} else if (result == getBookmarksResponse.errorRetrievingBookmarks) {
			logCollector.emitError({ event: "bookmarks.retrieve_failed", outcome: "error" });
			return c.json({ message: "Could not retrieve bookmarks" }, 500);
		}
		logCollector.emit({ event: "bookmarks.ok", outcome: "success" });
		return c.json(Array.isArray(result) ? [...result] : result);
	}
	logCollector.emitError({ event: "bookmarks.unauthorised", outcome: "unauthorised" });
	return c.json({ error: "Unauthorised" }, 403);
}
