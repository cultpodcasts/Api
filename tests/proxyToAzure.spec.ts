import { afterEach, describe, expect, it, vi } from "vitest";
import { Endpoint } from "../src/Endpoint";
import { AzureProxyAttempt, proxyToAzure } from "../src/proxyToAzure";
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
					forwardStatuses: [400, 404, 409],
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

	it("logs forwarded 4xx as proxy.forwarded not proxy.success", async () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify([]), { status: 409 }))
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
					forwardStatuses: [400, 404, 409],
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
		expect(infoSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "proxy.forwarded",
				outcome: "passthrough"
			})
		);
		expect(infoSpy).not.toHaveBeenCalledWith(
			expect.objectContaining({ event: "proxy.success" })
		);
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
					forwardStatuses: [400, 404, 409],
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

	it("returns Azure 400 body when 400 is in forwardStatuses", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ error: "Required property 'Url'" }), { status: 400 }))
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
					forwardStatuses: [400, 404, 409],
					logName: "secure-submit-endpoint"
				}),
			["submit"]
		);

		const resp = await app.request(
			"/",
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual({ error: "Required property 'Url'" });
	});

	it("reports upstream 502 before rewriting it to Worker 500", async () => {
		const seen: AzureProxyAttempt[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("bad gateway", { status: 502 }))
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
					forwardStatuses: [400, 404, 409],
					logName: "secure-submit-endpoint",
					observeAttempt: (attempt) => {
						seen.push(attempt);
					}
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
		expect(seen).toEqual([{ fetchThrew: false, upstreamStatus: 502 }]);
	});

	it("reports a thrown fetch separately from an upstream HTTP status", async () => {
		const seen: AzureProxyAttempt[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("network");
			})
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
					forwardStatuses: [400, 404, 409],
					logName: "secure-submit-endpoint",
					observeAttempt: (attempt) => {
						seen.push(attempt);
					}
				}),
			["submit"]
		);

		const resp = await app.request(
			"/",
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);

		expect(resp.status).toBe(500);
		expect(await resp.json()).toEqual({ error: "An error occurred" });
		expect(seen).toEqual([{ fetchThrew: true }]);
	});
});
