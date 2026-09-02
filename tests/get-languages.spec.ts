import { afterEach, describe, expect, it, vi } from "vitest";
import { getLanguages } from "../src/getLanguages";
import { hasPermission } from "../src/hasPermission";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

function r2Languages(text = "[]", httpEtag = '"lang-etag"'): R2ObjectBody {
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

describe("GET /languages", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("allows curate or admin from permissions or OAuth scope", () => {
		expect(hasPermission({ permissions: ["curate"] } as Auth0JwtPayload, "curate")).toBe(true);
		expect(hasPermission({ permissions: ["admin"] } as Auth0JwtPayload, "admin")).toBe(true);
		expect(hasPermission({ scope: "openid curate" } as Auth0JwtPayload, "curate")).toBe(true);
		expect(hasPermission({ scope: "admin" } as Auth0JwtPayload, "admin")).toBe(true);
		expect(hasPermission({ permissions: ["submit"], scope: "openid" } as Auth0JwtPayload, "curate")).toBe(false);
	});

	it("serves R2 languages for curate including scope-only M2M", async () => {
		const env = testEnv({
			Content: {
				get: async () => r2Languages('["en"]')
			} as unknown as R2Bucket
		});
		const viaPermissions = appWithPermissions("/languages", "get", getLanguages, ["curate"]);
		const viaScope = appWithAuthPayload("/languages", "get", getLanguages, {
			scope: "openid curate",
			azp: "m2m"
		} as Auth0JwtPayload);
		const viaAdmin = appWithPermissions("/languages", "get", getLanguages, ["admin"]);

		for (const app of [viaPermissions, viaScope, viaAdmin]) {
			const resp = await app.request("/languages", { method: "GET", headers: authJsonHeaders }, env);
			expect(resp.status).toBe(200);
			expect(await resp.text()).toBe('["en"]');
		}
	});

	it("returns 401 without auth, 403 without curate/admin, 404 when R2 misses", async () => {
		const unauth = appWithAuthPayload("/languages", "get", getLanguages, null);
		const forbidden = appWithPermissions("/languages", "get", getLanguages, ["submit"]);
		const missing = appWithPermissions("/languages", "get", getLanguages, ["curate"]);

		expect((await unauth.request("/languages", { method: "GET" }, testEnv())).status).toBe(401);
		expect((await forbidden.request("/languages", { method: "GET", headers: authJsonHeaders }, testEnv())).status).toBe(
			403
		);
		expect((await missing.request("/languages", { method: "GET", headers: authJsonHeaders }, testEnv())).status).toBe(
			404
		);
	});
});
