import { stream } from "hono/streaming";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./ActionContext";

export async function getSubjects(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');

	if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
		let object: R2ObjectBody | null = null;
		try {
			object = await c.env.Content.get("subjects");
		} catch (e) {
		}

		if (object === null) {
			return new Response("Object Not Found", { status: 404 });
		}
		AddResponseHeaders(c, { etag: object.etag, methods: ["GET", "OPTIONS"] });
		return stream(c, async (stream) => {
			stream.onAbort(() => {
				console.log('Aborted!');
			});
			await stream.pipe(object.body);
		});
	} else {
		return c.json({ message: "Unauthorised" }, 401);
	}
}
