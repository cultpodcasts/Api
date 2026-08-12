import { stream } from "hono/streaming";
import { ActionContext } from "./ActionContext";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { LogCollector } from "./LogCollector";

export async function homepageSsr(c: ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "homepageSsr" });
	let object: R2ObjectBody | null = null;
	try {
		object = await c.env.Content.get("homepage-ssr");
	} catch {
		logCollector.add({ event: "homepage_ssr.r2_error" });
	}
	if (object === null) {
		logCollector.emitError({ event: "homepage_ssr.not_found", outcome: "not_found" });
		return c.notFound();
	}
	AddResponseHeaders(c, { etag: object.etag, methods: ["GET", "OPTIONS"] });
	logCollector.addMessage("homepage_ssr.r2_body");
	return stream(c, async (s) => {
		s.onAbort(() => {
			if (!logCollector.hasFlushed()) {
				logCollector.emitError({ event: "homepage_ssr.stream_aborted", outcome: "aborted" });
			}
		});
		await s.pipe(object.body);
		if (!logCollector.hasFlushed()) {
			logCollector.emit({ event: "homepage_ssr.r2_hit", outcome: "success" });
		}
	});
}
