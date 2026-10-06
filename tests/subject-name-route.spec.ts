import { afterEach, describe, expect, it, vi } from "vitest";
import { getSubjectByName } from "../src/getSubjectByName";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

describe("subject name route", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("proxies a multi-word subject name as one encoded path segment", async () => {
		const name = "Alpha Beta/Gamma";
		const fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/subject/:name", "get", getSubjectByName, ["curate"]);

		const resp = await app.request(
			`/subject/${encodeURIComponent(name)}`,
			{ method: "GET", headers: authJsonHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(String(url).endsWith(`/api/subject/${encodeURIComponent(name)}`)).toBe(true);
		expect(init.method).toBe("GET");
	});
});
