import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { LogCollector } from "./LogCollector";
import { deleteBookmarkResponse } from "./deleteBookmarkResponse";
import { uuidPattern } from "./uuidPattern";

export async function deleteBookmark(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "deleteBookmark" });
	AddResponseHeaders(c, { methods: ["POST", "DELETE", "OPTIONS"] });
	if (auth0Payload) {
		const episodeId = c.req.param("episodeId");
		if (uuidPattern.test(episodeId)) {
			let id: DurableObjectId = c.env.PROFILE_DURABLE_OBJECT.idFromName(auth0Payload.sub);
			let stub = c.env.PROFILE_DURABLE_OBJECT.get(id);
			let result: deleteBookmarkResponse = await stub.deleteBookmark(auth0Payload.sub, episodeId);
			logCollector.add({ message: `result= ${result}` });
			if (result == deleteBookmarkResponse.deleted) {
				logCollector.emit({ event: "bookmark.delete_ok", outcome: "success" });
				return c.json({ message: "Success" });
			}
			logCollector.emitError({ event: "bookmark.delete_failed", outcome: "error" });
			if (result == deleteBookmarkResponse.unableToDeleteBookmark) {
				return c.json({ message: "Unable to delete bookmark" }, { status: 400 });
			}
			return c.json({ message: "Error" }, { status: 400 });
		}
		logCollector.emitError({ event: "bookmark.delete_bad_episode_id", outcome: "error" });
		return c.json({ message: "Episode-id does not match recognised uuid pattern." }, { status: 400 });
	}
	logCollector.emitError({ event: "bookmark.delete_unauthorised", outcome: "unauthorised" });
	return c.json({ error: "Unauthorised" }, 403);
}
