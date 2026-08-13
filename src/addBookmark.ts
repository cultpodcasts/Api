import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { LogCollector } from "./LogCollector";
import { addBookmarkResponse } from "./addBookmarkResponse";
import { uuidPattern } from "./uuidPattern";

export async function addBookmark(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "addBookmark" });
	AddResponseHeaders(c, { methods: ["POST", "DELETE", "OPTIONS"] });
	if (auth0Payload && auth0Payload.sub) {
		const episodeId = c.req.param("episodeId");
		if (uuidPattern.test(episodeId)) {
			let id: DurableObjectId = c.env.PROFILE_DURABLE_OBJECT.idFromName(auth0Payload.sub);
			let stub = c.env.PROFILE_DURABLE_OBJECT.get(id);
			let result: addBookmarkResponse = await stub.addBookmark(auth0Payload.sub, episodeId);
			logCollector.addMessage(`result= ${result}`);
			if (result == addBookmarkResponse.created) {
				logCollector.emit({ event: "bookmark.add_ok", outcome: "success" });
				return c.json({ message: "Success" });
			}
			logCollector.emitError({ event: "bookmark.add_failed", outcome: "error" });
			if (result == addBookmarkResponse.duplicateUserBookmark) {
				return c.json({ message: "Bookmark exists" }, { status: 409 });
			} else if (result == addBookmarkResponse.unableToCreateUser) {
				return c.json({ message: "Unable to create user" }, { status: 400 });
			} else if (result == addBookmarkResponse.unableToCreateBookmark) {
				return c.json({ message: "Unable to create bookmark" }, { status: 400 });
			}
			return c.json({ message: "Error" }, { status: 400 });
		}
		logCollector.emitError({ event: "bookmark.add_bad_episode_id", outcome: "error" });
		return c.json({ message: "Episode-id does not match recognised uuid pattern." }, { status: 400 });
	}
	logCollector.emitError({ event: "bookmark.add_unauthorised", outcome: "unauthorised" });
	return c.json({ error: "Unauthorised" }, 403);
}
