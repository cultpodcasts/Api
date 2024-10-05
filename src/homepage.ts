import { stream } from "hono/streaming";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";

export async function homepage(c: ActionContext): Promise<Response> {
	let object: R2ObjectBody | null = null;
	try {
		object = await c.env.Content.get("homepage");
	} catch (e) {
		console.error("Failure to retrieve homepage");
		console.error(e);
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
}