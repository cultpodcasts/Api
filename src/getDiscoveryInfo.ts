import { stream } from "hono/streaming";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { LogCollector } from "./LogCollector";

export async function getDiscoveryInfo(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "getDiscoveryInfo" });
	AddResponseHeaders(c, { omitCacheControlHeader: true, methods: ["GET", "OPTIONS"] });

	if (auth0Payload?.permissions && auth0Payload.permissions.includes("curate")) {
		let object: R2ObjectBody | null = null;
		try {
			object = await c.env.Content.get("discovery-info");
		} catch {
			logCollector.add({ event: "discovery_info.r2_error" });
		}
		if (object === null) {
			logCollector.emitWarn({ event: "discovery_info.not_found", outcome: "not_found" });
			return c.notFound();
		}
		object.writeHttpMetadata(c.res.headers);
		c.res.headers.set("ETag", object.httpEtag);
		logCollector.addMessage("discovery_info.r2_body");
		return stream(c, async (s) => {
			s.onAbort(() => {
				if (!logCollector.hasFlushed()) {
					logCollector.emitError({ event: "discovery_info.stream_aborted", outcome: "aborted" });
				}
			});
			await s.pipe(object.body);
			if (!logCollector.hasFlushed()) {
				logCollector.emit({ event: "discovery_info.r2_hit", outcome: "success" });
			}
		});
	}
	if (!auth0Payload) {
		logCollector.emitError({ event: "discovery_info.unauthorised", outcome: "unauthorised" });
		return c.json({ error: "Unauthorised" }, 401);
	}
	logCollector.emitError({ event: "discovery_info.forbidden", outcome: "forbidden" });
	return c.json({ error: "Forbidden" }, 403);
}
