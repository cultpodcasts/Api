import { stream } from "hono/streaming";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";
import { LogCollector } from "./LogCollector";

export async function getPeople(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "getPeople" });

	if (auth0Payload?.permissions && auth0Payload.permissions.includes("curate")) {
		let object: R2ObjectBody | null = null;

		try {
			object = await c.env.Content.get("people");
		} catch {
			logCollector.add({ event: "people.r2_error" });
		}

		if (object !== null) {
			AddResponseHeaders(c, { omitCacheControlHeader: true, methods: ["GET", "OPTIONS"] });
			c.header("Cache-Control", "no-store");
			logCollector.addMessage("people.r2_body");

			return stream(c, async (s) => {
				s.onAbort(() => {
					if (!logCollector.hasFlushed()) {
						logCollector.emitError({
							event: "people.stream_aborted",
							outcome: "aborted"
						});
					}
				});
				await s.pipe(object.body);
				if (!logCollector.hasFlushed()) {
					logCollector.emit({
						event: "people.r2_hit",
						outcome: "success"
					});
				}
			});
		}

		try {
			const url = getEndpoint(Endpoint.people, c.env);
			const resp = await fetch(url, {
				headers: buildFetchHeaders(c.req, url),
				method: "GET"
			});
			logCollector.add({ status: resp.status });

			if (resp.status === 200) {
				logCollector.emit({
					event: "people.azure_ok",
					outcome: "success"
				});
				AddResponseHeaders(c, { omitCacheControlHeader: true, methods: ["GET", "OPTIONS"] });
				c.header("Cache-Control", "no-store");
				return c.newResponse(resp.body);
			}

			logCollector.add({ event: "people.azure_non_200" });
		} catch {
			logCollector.add({ event: "people.azure_error" });
		}

		logCollector.emitError({
			event: "people.not_found",
			outcome: "not_found"
		});
		return c.notFound();
	}

	if (!auth0Payload) {
		logCollector.emitError({
			event: "people.unauthorised",
			outcome: "unauthorised"
		});
		return c.json({ error: "Unauthorised" }, 401);
	}

	logCollector.emitError({
		event: "people.forbidden",
		outcome: "forbidden"
	});
	return c.json({ error: "Forbidden" }, 403);
}
