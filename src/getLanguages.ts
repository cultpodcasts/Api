import { stream } from "hono/streaming";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { hasPermission } from "./hasPermission";
import { LogCollector } from "./LogCollector";

export async function getLanguages(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "getLanguages" });

	if (hasPermission(auth0Payload, "curate") || hasPermission(auth0Payload, "admin")) {
		let object: R2ObjectBody | null = null;
		try {
			object = await c.env.Content.get("languages");
		} catch {
			logCollector.add({ event: "languages.r2_error" });
		}
		if (object === null) {
			logCollector.emitError({ event: "languages.not_found", outcome: "not_found" });
			return c.notFound();
		}
		AddResponseHeaders(c, { etag: object.httpEtag, methods: ["GET", "OPTIONS"] });
		logCollector.addMessage("languages.r2_body");
		return stream(c, async (s) => {
			s.onAbort(() => {
				if (!logCollector.hasFlushed()) {
					logCollector.emitError({ event: "languages.stream_aborted", outcome: "aborted" });
				}
			});
			await s.pipe(object.body);
			if (!logCollector.hasFlushed()) {
				logCollector.emit({ event: "languages.r2_hit", outcome: "success" });
			}
		});
	}
	if (!auth0Payload) {
		logCollector.emitError({ event: "languages.unauthorised", outcome: "unauthorised" });
		return c.json({ error: "Unauthorised" }, 401);
	}
	logCollector.emitError({ event: "languages.forbidden", outcome: "forbidden" });
	return c.json({ error: "Forbidden" }, 403);
}
