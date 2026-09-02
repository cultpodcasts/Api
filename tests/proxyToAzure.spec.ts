import { afterEach, describe, expect, it, vi } from "vitest";
import { Endpoint } from "../src/Endpoint";
import { proxyToAzure } from "../src/proxyToAzure";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

describe("proxyToAzure", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns Azure 409 body and status when 409 is in forwardStatuses", async () => {
		const ids = [
			"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
		];
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(ids), { status: 409 }))
		);
		const app = appWithPermissions(
			"/",
			"post",
			(c) =>
				proxyToAzure(c, {
					permission: "submit",
					endpoint: Endpoint.submit,
					method: "POST",
					body: "{}",
					successStatuses: [200],
					forwardStatuses: [404, 409],
					logName: "secure-submit-endpoint"
				}),
			["submit"]
		);

		const resp = await app.request(
			"/",
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(ids);
	});

	it("maps unforwarded Azure 500 to Worker 500 instead of the upstream body", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ message: "boom" }), { status: 500 }))
		);
		const app = appWithPermissions(
			"/",
			"post",
			(c) =>
				proxyToAzure(c, {
					permission: "submit",
					endpoint: Endpoint.submit,
					method: "POST",
					body: "{}",
					successStatuses: [200],
					forwardStatuses: [404, 409],
					logName: "secure-submit-endpoint"
				}),
			["submit"]
		);

		const resp = await app.request(
			"/",
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);

		expect(resp.status).toBe(500);
		expect(await resp.json()).toEqual({ error: "Error" });
	});
});
