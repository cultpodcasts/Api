import { stream } from "hono/streaming";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { LogCollector } from "./LogCollector";

export async function getFlairs(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "getFlairs" });

	if (auth0Payload?.permissions && auth0Payload.permissions.includes("curate")) {
		let object: R2ObjectBody | null = null;
		try {
			object = await c.env.Content.get("flairs");
		} catch {
			logCollector.add({ event: "flairs.r2_error" });
		}
		if (object === null) {
			logCollector.emitError({
				event: "flairs.not_found",
				outcome: "not_found"
			});
			return c.notFound();
		}
		AddResponseHeaders(c, { etag: object.httpEtag, methods: ["GET", "OPTIONS"] });
		logCollector.addMessage("flairs.r2_body");
		return stream(c, async (s) => {
			s.onAbort(() => {
				if (!logCollector.hasFlushed()) {
					logCollector.emitError({
						event: "flairs.stream_aborted",
						outcome: "aborted"
					});
				}
			});
			await s.pipe(object.body);
			if (!logCollector.hasFlushed()) {
				logCollector.emit({
					event: "flairs.r2_hit",
					outcome: "success"
				});
			}
		});
	}

	if (!auth0Payload) {
		logCollector.emitError({
			event: "flairs.unauthorised",
			outcome: "unauthorised"
		});
		return c.json({ error: "Unauthorised" }, 401);
	}

	logCollector.emitError({
		event: "flairs.forbidden",
		outcome: "forbidden"
	});
	return c.json({ error: "Forbidden" }, 403);
}
