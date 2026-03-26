import { stream } from "hono/streaming";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { LogCollector } from "./LogCollector";

export async function getLanguages(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
		let object: R2ObjectBody | null = null;
		try {
			object = await c.env.Content.get("languages");
		} catch {
			logCollector.addMessage("Unable to retrieve languages");
		}
		if (object === null) {
			logCollector.addMessage(logCollector.message ?? "No languages object found");
			console.error(logCollector.toEndpointLog());
			return c.notFound();
		}
		AddResponseHeaders(c, { etag: object.httpEtag, methods: ["GET", "OPTIONS"] });
		logCollector.addMessage("Successfully obtained languages data.");
		console.log(logCollector.toEndpointLog());
		return stream(c, async (stream) => {
			stream.onAbort(() => {
				logCollector.addMessage('Aborted!');
				console.error(logCollector.toEndpointLog());
			});
			await stream.pipe(object.body);
		});
	} else {
		logCollector.addMessage("Unauthorised to use getLanguages.");
		console.error(logCollector.toEndpointLog());
		return c.json({ message: "Unauthorised" }, 401);
	}
}
