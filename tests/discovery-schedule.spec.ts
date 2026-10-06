import { afterEach, describe, expect, it, vi } from "vitest";
import { getDiscoverySchedule, putDiscoverySchedule } from "../src/discoverySchedule";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const azureSchedule = { cron: "0 * * * *", nextRuns: ["2026-10-07T00:00:00Z"] };

describe("discovery schedule", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("GET returns the schedule read model", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(azureSchedule), { status: 200 })));
		const app = appWithPermissions("/discovery-schedule", "get", getDiscoverySchedule, ["admin"]);
		const resp = await app.request("/discovery-schedule", { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(200);
		expect(resp.headers.get("Cache-Control")).toBe("no-store");
		expect(await resp.json()).toEqual(azureSchedule);
	});

	it.each([200, 202] as const)(
		"PUT acknowledges Azure %s with an empty 202 and drops the resource body",
		async (status) => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(JSON.stringify(azureSchedule), { status }))
			);
			const app = appWithPermissions("/discovery-schedule", "put", putDiscoverySchedule, ["admin"]);
			const resp = await app.request(
				"/discovery-schedule",
				{
					method: "PUT",
					headers: authJsonHeaders,
					body: JSON.stringify({ cron: "0 * * * *" })
				},
				testEnv()
			);

			expect(resp.status).toBe(202);
			expect(resp.headers.get("Cache-Control")).toBe("no-store");
			expect(await resp.text()).toBe("");
		}
	);

	it("PUT forwards Azure 400", async () => {
		const payload = { error: "Cron is invalid" };
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), { status: 400 })));
		const app = appWithPermissions("/discovery-schedule", "put", putDiscoverySchedule, ["admin"]);
		const resp = await app.request(
			"/discovery-schedule",
			{
				method: "PUT",
				headers: authJsonHeaders,
				body: JSON.stringify({ cron: "not-a-cron" })
			},
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual(payload);
	});
});
