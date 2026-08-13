import { stream } from "hono/streaming";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { LogCollector } from "./LogCollector";

export async function getSubjects(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "getSubjects" });

	if (auth0Payload?.permissions && auth0Payload.permissions.includes("curate")) {
		let object: R2ObjectBody | null = null;
		try {
			object = await c.env.Content.get("subjects");
		} catch {
			logCollector.add({ event: "subjects.r2_error" });
		}
		if (object === null) {
			logCollector.emitError({ event: "subjects.not_found", outcome: "not_found" });
			return c.notFound();
		}
		AddResponseHeaders(c, { etag: object.httpEtag, methods: ["GET", "OPTIONS"] });
		logCollector.addMessage("subjects.r2_body");
		return stream(c, async (s) => {
			s.onAbort(() => {
				if (!logCollector.hasFlushed()) {
					logCollector.emitError({ event: "subjects.stream_aborted", outcome: "aborted" });
				}
			});
			await s.pipe(object.body);
			if (!logCollector.hasFlushed()) {
				logCollector.emit({ event: "subjects.r2_hit", outcome: "success" });
			}
		});
	}
	if (!auth0Payload) {
		logCollector.emitError({ event: "subjects.unauthorised", outcome: "unauthorised" });
		return c.json({ error: "Unauthorised" }, 401);
	}
	logCollector.emitError({ event: "subjects.forbidden", outcome: "forbidden" });
	return c.json({ error: "Forbidden" }, 403);
}
