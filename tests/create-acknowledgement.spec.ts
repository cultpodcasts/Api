import { afterEach, describe, expect, it, vi } from "vitest";
import { createPerson } from "../src/createPerson";
import { createSubject } from "../src/createSubject";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

describe("create subject and person acknowledgements", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each([
		["/subject", createSubject],
		["/person", createPerson]
	] as const)("POST %s forwards an empty 202", async (path, handler) => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(path, "post", handler, ["curate"]);
		const resp = await app.request(
			path,
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ name: "Alpha Beta" })
			},
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.text()).toBe("");
		expect(fetchMock).toHaveBeenCalledOnce();
		const init = fetchMock.mock.calls[0][1] as { method?: string };
		expect(init.method).toBe("POST");
	});

	it.each([400, 409] as const)(
		"POST /subject forwards Azure %s and the JSON body",
		async (status) => {
			const payload = { error: "Name is required" };
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(JSON.stringify(payload), { status }))
			);
			const app = appWithPermissions("/subject", "post", createSubject, ["curate"]);
			const resp = await app.request(
				"/subject",
				{
					method: "POST",
					headers: authJsonHeaders,
					body: JSON.stringify({ name: "Alpha Beta" })
				},
				testEnv()
			);

			expect(resp.status).toBe(status);
			expect(await resp.json()).toEqual(payload);
		}
	);
});
