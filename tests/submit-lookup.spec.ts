import { afterEach, describe, expect, it, vi } from "vitest";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";
import { submitLookup } from "../src/submitLookup";
import { appWithAuthPayload, appWithPermissions, testEnv } from "./honoTestApp";

const submissionsCreate = vi.hoisted(() => vi.fn());

vi.mock("@prisma/client", () => ({
	PrismaClient: class {
		submissions = { create: submissionsCreate };
	},
	Prisma: {
		PrismaClientKnownRequestError: class extends Error {
			code = "";
		}
	}
}));

vi.mock("@prisma/adapter-d1", () => ({
	PrismaD1: class {}
}));

const authHeaders = { Authorization: "Bearer test-token" };

const conflictIds = [
	"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
];

function lookupApp(permissions: string[] = ["curate"]) {
	return appWithPermissions("/submit/lookup", "get", submitLookup, permissions);
}

describe("GET /submit/lookup", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		submissionsCreate.mockReset();
	});

	it("forwards GET to Azure SubmitUrl with the encoded url query and does not D1-write", async () => {
		const episodeUrl = "https://open.spotify.com/episode/opaqueid00000000000000";
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						known: true,
						podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
						podcastName: "Stored Show Name"
					}),
					{ status: 200 }
				)
		);
		vi.stubGlobal("fetch", fetchMock);
		const app = lookupApp();

		const resp = await app.request(
			`/submit/lookup?url=${encodeURIComponent(episodeUrl)}`,
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({
			known: true,
			podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			podcastName: "Stored Show Name"
		});
		expect(resp.headers.get("Cache-Control")).not.toBe("max-age=600");
		expect(fetchMock).toHaveBeenCalledOnce();
		const requested = String(fetchMock.mock.calls[0][0]);
		expect(requested).toContain("https://functions.example/api/SubmitUrl?");
		expect(requested).toContain(`url=${encodeURIComponent(episodeUrl)}`);
		expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET" });
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("forwards Azure 200 ambiguous membership as 200 with podcastIds, not 409", async () => {
		const episodeUrl = "https://www.bbc.co.uk/sounds/play/p0example";
		const ambiguous = {
			known: false,
			ambiguous: true,
			kind: "streaming",
			podcastIds: conflictIds
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(ambiguous), { status: 200 }))
		);
		const app = lookupApp();

		const resp = await app.request(
			`/submit/lookup?url=${encodeURIComponent(episodeUrl)}`,
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(resp.status).not.toBe(409);
		expect(await resp.json()).toEqual(ambiguous);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("returns Worker 500 when Azure 500s and does not D1-write", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("upstream failure", { status: 500 }))
		);
		const app = lookupApp();

		const resp = await app.request(
			`/submit/lookup?url=${encodeURIComponent("https://example.com/episode")}`,
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(500);
		expect(await resp.json()).toEqual({ error: "Error" });
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("forwards Azure 400 when url query is missing and does not D1-write", async () => {
		const azureBody = { error: "Url must be an absolute http or https URL" };
		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify(azureBody), { status: 400 })
		);
		vi.stubGlobal("fetch", fetchMock);
		const app = lookupApp();

		const resp = await app.request(
			"/submit/lookup",
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual(azureBody);
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("forwards Azure 400 for a non-http url without falling back to D1", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ error: "Url must be an absolute http or https URL" }),
						{ status: 400 }
					)
			)
		);
		const app = lookupApp();

		const resp = await app.request(
			"/submit/lookup?url=ftp://example.com/episode",
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual({
			error: "Url must be an absolute http or https URL"
		});
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("forwards Azure 404 when api-infra has no GET SubmitUrl and does not D1-write", async () => {
		const azureBody = { error: "The resource you are looking for has been removed, had its name changed, or is temporarily unavailable." };
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(azureBody), { status: 404 }))
		);
		const app = lookupApp();

		const resp = await app.request(
			`/submit/lookup?url=${encodeURIComponent("https://example.com/episode")}`,
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(404);
		expect(await resp.json()).toEqual(azureBody);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("forwards unknown streaming with scraped podcastName as 200", async () => {
		const extracted = { known: false, kind: "streaming", podcastName: "Extracted Show" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(extracted), { status: 200 }))
		);
		const app = lookupApp(["curate"]);

		const resp = await app.request(
			`/submit/lookup?url=${encodeURIComponent("https://www.bbc.co.uk/sounds/play/p0example")}`,
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(extracted);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("forwards unknown streaming scrape-miss without podcastName as 200", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ known: false, kind: "streaming" }),
						{ status: 200 }
					)
			)
		);
		const app = lookupApp();

		const resp = await app.request(
			`/submit/lookup?url=${encodeURIComponent("https://www.bbc.co.uk/sounds/play/p0example")}`,
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ known: false, kind: "streaming" });
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("forwards unknown podcast-service membership as 200", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ known: false, kind: "podcast-service" }),
						{ status: 200 }
					)
			)
		);
		const app = lookupApp();

		const resp = await app.request(
			`/submit/lookup?url=${encodeURIComponent("https://open.spotify.com/episode/opaqueid00000000000000")}`,
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ known: false, kind: "podcast-service" });
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("GETs Azure SubmitUrl when Curator has curate permission only", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ known: false, kind: "streaming" }), { status: 200 })
		);
		vi.stubGlobal("fetch", fetchMock);
		const app = lookupApp(["curate"]);

		const resp = await app.request(
			"/submit/lookup?url=https://example.com/x",
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ known: false, kind: "streaming" });
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("GETs Azure SubmitUrl when Curator has OAuth scope curate only", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ known: false, kind: "streaming" }), { status: 200 })
		);
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload("/submit/lookup", "get", submitLookup, {
			scope: "openid curate",
			azp: "spa"
		} as Auth0JwtPayload);

		const resp = await app.request(
			"/submit/lookup?url=https://example.com/x",
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("returns 403 when authenticated with submit permission only", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = lookupApp(["submit"]);

		const resp = await app.request(
			"/submit/lookup?url=https://example.com/x",
			{ method: "GET", headers: authHeaders },
			testEnv()
		);

		expect(resp.status).toBe(403);
		expect(await resp.json()).toEqual({ error: "Forbidden" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("returns 401 when unsigned and does not fetch Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload("/submit/lookup", "get", submitLookup, null);

		const resp = await app.request(
			"/submit/lookup?url=https://example.com/x",
			{ method: "GET" },
			testEnv()
		);

		expect(resp.status).toBe(401);
		expect(await resp.json()).toEqual({ error: "Unauthorised" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});
});
