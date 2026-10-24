import { parseJwt } from "@cfworker/jwt";
import { createMiddleware } from "hono/factory";
import { AppContext } from "./AppContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Context, Next } from "hono";
import { LogCollector } from "./LogCollector";

/**
 * Query-string `access_token` is only for the discovery curation WebSocket upgrade
 * (`GET /discovery-curation/session/ws`). Browsers cannot set `Authorization` on WS.
 * All other Auth0 routes must use Bearer only — tokens in query strings leak via logs/Referer.
 */
export function allowAccessTokenQuery(opts: {
	upgradeHeader?: string | null;
	path: string;
}): boolean {
	const isWsUpgrade = opts.upgradeHeader?.toLowerCase() === "websocket";
	const path = opts.path.split("?")[0] ?? opts.path;
	const isDiscoverySessionWs =
		path === "/discovery-curation/session/ws" ||
		path.endsWith("/discovery-curation/session/ws");
	return isWsUpgrade || isDiscoverySessionWs;
}

export const Auth0Middleware = createMiddleware<AppContext>(async (c: Context<AppContext, any, {}>, next: Next) => {
	const authorization = c.req.header("Authorization");
	const bearer = "Bearer ";
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "Auth0Middleware" });
	if (!c.env.auth0Issuer || !c.env.auth0Audience) {
		logCollector.emitError({ event: "auth0.not_configured", outcome: "error" });
		return new Response("Configure error (1)", { status: 500 });
	}
	c.set("auth0", (_payload) => { });
	const queryTokenAllowed = allowAccessTokenQuery({
		upgradeHeader: c.req.header("Upgrade"),
		path: c.req.path
	});
	const queryToken = queryTokenAllowed ? c.req.query("access_token") : undefined;
	const token =
		authorization && authorization.startsWith(bearer)
			? authorization.slice(bearer.length)
			: queryToken || undefined;
	if (token) {
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
});
