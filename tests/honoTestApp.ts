import { Hono } from "hono";
import type { Env } from "../src/Env";
import type { Auth0ActionContext } from "../src/Auth0ActionContext";

export function testEnv(): Env {
	return {
		secureSubmitEndpoint: new URL("https://functions.example/api/SubmitUrl"),
		secureDiscoveryCurationEndpoint: new URL("https://functions.example/api/DiscoveryCuration"),
		stagingHostSuffix: "",
		apiDB: {} as D1Database
	} as Env;
}

export function appWithPermissions(
	path: string,
	method: "get" | "post",
	handler: (c: Auth0ActionContext) => Promise<Response>,
	permissions: string[]
): Hono<{ Bindings: Env }> {
	const app = new Hono<{ Bindings: Env }>();
	app.use("*", async (c, next) => {
		c.set("auth0", () => ({
			permissions,
			scope: permissions.join(" "),
			azp: "test-client"
		}));
		await next();
	});
	app[method](path, (c) => handler(c as Auth0ActionContext));
	return app;
}

export const authJsonHeaders = {
	Authorization: "Bearer test-token",
	"Content-Type": "application/json"
};
