import { Hono } from "hono";
import type { Env } from "../src/Env";
import type { Auth0ActionContext } from "../src/Auth0ActionContext";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";

export type TestHttpMethod = "get" | "post" | "put" | "delete";

export function testEnv(overrides: Partial<Env> = {}): Env {
	return {
		secureSubmitEndpoint: new URL("https://functions.example/api/SubmitUrl"),
		secureDiscoveryCurationEndpoint: new URL("https://functions.example/api/DiscoveryCuration"),
		securePeopleEndpoint: new URL("https://functions.example/api/People"),
		secureSupportedLanguagesEndpoint: new URL("https://functions.example/api/SupportedLanguages"),
		secureTitleCasingRulesEndpoint: new URL("https://functions.example/api/TitleCasingRules"),
		stagingHostSuffix: "",
		apiDB: {} as D1Database,
		Content: { get: async () => null } as unknown as R2Bucket,
		...overrides
	} as Env;
}

export function appWithAuthPayload(
	path: string,
	method: TestHttpMethod,
	handler: (c: Auth0ActionContext) => Promise<Response>,
	payload: Auth0JwtPayload | null
): Hono<{ Bindings: Env }> {
	const app = new Hono<{ Bindings: Env }>();
	app.use("*", async (c, next) => {
		c.set("auth0", () => payload);
		await next();
	});
	app[method](path, (c) => handler(c as Auth0ActionContext));
	return app;
}

export function appWithPermissions(
	path: string,
	method: TestHttpMethod,
	handler: (c: Auth0ActionContext) => Promise<Response>,
	permissions: string[]
): Hono<{ Bindings: Env }> {
	return appWithAuthPayload(path, method, handler, {
		permissions,
		scope: permissions.join(" "),
		azp: "test-client"
	} as Auth0JwtPayload);
}

export const authJsonHeaders = {
	Authorization: "Bearer test-token",
	"Content-Type": "application/json"
};
