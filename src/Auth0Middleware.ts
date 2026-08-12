import { parseJwt } from "@cfworker/jwt";
import { createMiddleware } from "hono/factory";
import { AppContext } from "./AppContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Context, Next } from "hono";
import { LogCollector } from "./LogCollector";

export const Auth0Middleware = createMiddleware<AppContext>(async (c: Context<AppContext, any, {}>, next: Next) => {
	const authorization = c.req.header("Authorization");
	const bearer = "Bearer ";
	const logCollector = new LogCollector();
	logCollector.add({ route: "Auth0Middleware" });
	if (!c.env.auth0Issuer || !c.env.auth0Audience) {
		logCollector.emitError({ event: "auth0.not_configured", outcome: "error" });
	} else {
		c.set("auth0", (_payload) => { });
		if (authorization && authorization.startsWith(bearer)) {
			const token = authorization.slice(bearer.length);
			const result = await parseJwt(token, c.env.auth0Issuer, c.env.auth0Audience);
			if (result.valid) {
				c.set("auth0", (_payload) => result.payload as Auth0JwtPayload);
			} else {
				logCollector.emitError({ event: "auth0.jwt_invalid", outcome: "unauthorised" });
			}
		} else {
			logCollector.emitError({ event: "auth0.no_bearer", outcome: "unauthorised" });
		}
		await next();
		return;
	}
	return new Response("Configure error (1)", { status: 500 });
});
