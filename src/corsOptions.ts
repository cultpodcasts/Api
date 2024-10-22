import { Context } from "hono";
import { getOrigin } from "./getOrigin";

export const corsOptions = {
	origin: (origin: string, c: Context<any, any, {}>) => {
		return getOrigin(origin, c.env.stagingHostSuffix);
	},
	allowHeaders: ['content-type', 'authorization'],
	allowMethods: ['GET', 'HEAD', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
	maxAge: 86400,
	credentials: true,
	exposeHeaders: ['X-Origin']
};
