import { stream } from "hono/streaming";
import { ActionContext } from "./ActionContext";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { LogCollector } from "./LogCollector";

export async function homepageSsr(c: ActionContext): Promise<Response> {
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    let object: R2ObjectBody | null = null;
    try {
        object = await c.env.Content.get("homepage-ssr");
    } catch {
        logCollector.add({ message: `Failure to retrieve ssr-homepage` });
    }
    if (object === null) {
        logCollector.add({ message: logCollector.message ?? "No homepage object found" });
        console.error(logCollector.toEndpointLog());
        return c.notFound();
    }
    AddResponseHeaders(c, { etag: object.etag, methods: ["GET", "OPTIONS"] });
    logCollector.add({ message: `Successfully obtained ssr-homepage data.` });
    console.log(logCollector.toEndpointLog());
    return stream(c, async (stream) => {
        stream.onAbort(() => {
            logCollector.add({ message: 'Aborted!' });
            console.error(logCollector.toEndpointLog());
        });
        await stream.pipe(object.body);
    });
}
