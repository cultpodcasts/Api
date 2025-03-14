import { Context } from "hono";
import { getOrigin } from './getOrigin';
import { HttpResponseHeaderOptions } from "./HttpResponseHeaderOptions";

export function AddResponseHeaders(c: Context<any>, opts: HttpResponseHeaderOptions) {
	if (opts.cacheControlMaxAge && parseInt(opts.cacheControlMaxAge.toString()) >= 0) {
		c.header("Cache-Control", `max-age=${parseInt(opts.cacheControlMaxAge.toString())}`);
	} else if (c.req.method == "GET" && opts.omitCacheControlHeader != true) {
		c.header("Cache-Control", `max-age=600`);
	}
	if (opts.contextType) {
		c.header("Content-Type", opts.contextType);
	} else {
		c.header("Content-Type", "application/json");
	}
	if (opts.etag) {
		c.header("etag", opts.etag);
	}
	c.header("Access-Control-Allow-Origin", getOrigin(c.req.header("Origin"), c.env.stagingHostSuffix));
	c.header("Access-Control-Allow-Methods", opts.methods.map(x => x.toUpperCase).join(","));
}
