import { afterEach, describe, expect, it, vi } from "vitest";
import { getPeople } from "../src/getPeople";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";

function r2Body(text: string, httpEtag = '"people-etag"'): R2ObjectBody {
	return {
		httpEtag,
		body: new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(text));
				controller.close();
			}
		})
	} as R2ObjectBody;
}

describe("getPeople", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns the R2 people list with Cache-Control no-store and no etag", async () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const app = appWithPermissions("/people", "get", getPeople, ["curate"]);
		const env = testEnv({
			Content: {
				get: async () => r2Body('{"people":[]}')
			} as unknown as R2Bucket
		});

		const resp = await app.request("/people", { method: "GET", headers: authJsonHeaders }, env);
		const body = await resp.text();

		expect(resp.status).toBe(200);
		expect(body).toBe('{"people":[]}');
		expect(resp.headers.get("Cache-Control")).toBe("no-store");
		expect(resp.headers.get("etag")).toBeNull();
		expect(infoSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "people.r2_hit",
				outcome: "success",
				route: "getPeople"
			})
		);
	});

	it("falls back to Azure with no-store and no etag when R2 misses", async () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response('{"from":"azure"}', { status: 200 }))
		);
		const app = appWithPermissions("/people", "get", getPeople, ["curate"]);

		const resp = await app.request("/people", { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(200);
		expect(await resp.text()).toBe('{"from":"azure"}');
		expect(resp.headers.get("Cache-Control")).toBe("no-store");
		expect(resp.headers.get("etag")).toBeNull();
		expect(infoSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "people.azure_ok",
				outcome: "success"
			})
		);
	});

	it("emits emitError via console.error when the list cannot be loaded", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const app = appWithPermissions("/people", "get", getPeople, ["curate"]);
		vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));

		const resp = await app.request("/people", { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(404);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "people.not_found",
				outcome: "not_found",
				route: "getPeople"
			})
		);
	});

	it("returns 401 without a payload and 403 without curate", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const unauth = appWithAuthPayload("/people", "get", getPeople, null);
		const forbidden = appWithPermissions("/people", "get", getPeople, ["submit"]);

		expect((await unauth.request("/people", { method: "GET" }, testEnv())).status).toBe(401);
		expect((await forbidden.request("/people", { method: "GET", headers: authJsonHeaders }, testEnv())).status).toBe(
			403
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ event: "people.unauthorised" }));
		expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ event: "people.forbidden" }));
	});

	it("does not treat OAuth scope-only curate as sufficient (permissions claim required)", async () => {
		const app = appWithAuthPayload("/people", "get", getPeople, {
			scope: "openid curate",
			azp: "m2m"
		} as Auth0JwtPayload);

		const resp = await app.request("/people", { method: "GET", headers: authJsonHeaders }, testEnv());
		expect(resp.status).toBe(403);
	});
});
