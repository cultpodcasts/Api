import { parseJwt } from "@cfworker/jwt";
import { createMiddleware } from "hono/factory";
import { AppContext } from "./AppContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Context, Next } from "hono";

export const Auth0Middleware = createMiddleware<AppContext>(async (c: Context<AppContext, any, {}>, next: Next) => {
	const authorization = c.req.header('Authorization');
	const bearer = "Bearer ";
	c.set('auth0', (payload) => { });
	if (authorization && authorization.startsWith(bearer)) {
		const token = authorization.slice(bearer.length);
		const result = await parseJwt(token, c.env.auth0Issuer, c.env.auth0Audience);
		if (result.valid) {
			c.set('auth0', (payload) => result.payload as Auth0JwtPayload);
		} else {
			console.log(result.reason);
		}
	} else {
		console.log("no bearer");
	}
	await next();
});
