import { afterEach, describe, expect, it, vi } from "vitest";
import { getSubjectByName } from "../src/getSubjectByName";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

describe("subject name route", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("proxies a multi-word subject name as one encoded path segment", async () => {
		const fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/subject/:name", "get", getSubjectByName, ["curate"]);

		const resp = await app.request(
			`/subject/${encodeURIComponent("Alpha Beta")}`,
			{ method: "GET", headers: authJsonHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		const called = fetchMock.mock.calls[0][0] as Request | URL | string;
		const href = called instanceof Request ? called.url : String(called);
		expect(href).toContain("/api/subject/Alpha%20Beta");
		expect(href).not.toContain("%2520");
	});
});
