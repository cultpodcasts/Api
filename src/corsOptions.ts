import { Context } from "hono";
import { getOrigin } from "./getOrigin";

export const corsOptions = {
	origin: (origin: string, c: Context<any, any, {}>) => {
		return getOrigin(origin, c.env.stagingHostSuffix);
	},
	// Keep in sync with any admin UI custom headers (cache-control/pragma previously
	// blocked title-casing GETs cross-origin: OPTIONS ok, browser never sent GET).
	allowHeaders: ['content-type', 'authorization', 'cache-control', 'pragma'],
	allowMethods: ['GET', 'HEAD', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
	maxAge: 86400,
	credentials: true,
	exposeHeaders: ['X-Origin']
};
