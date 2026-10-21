import { afterEach, describe, expect, it, vi } from "vitest";
import { Endpoint } from "../src/Endpoint";
import { getEndpoint } from "../src/endpoints";
import { submitUrlRequestSchema } from "../src/openapiSchemas";
import { SubmitRoute } from "../src/openapiSubmitPodcastRoutes";
import { submit } from "../src/submit";
import { appWithAuthPayload, appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

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

// Synthetic ids and names only.
const url = "https://example.com/synthetic-report";
const parentId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** Each parent field alone is enough to make the body an attach target (RPP #1054). */
const parentBodies = [
	["parentKind", { url, parentKind: "NewsOrganisation" }],
	["parentId", { url, parentId }],
	["parentName", { url, parentName: "Synthetic Desk" }],
	["all parent fields", { url, parentKind: "TvShow", parentId, parentName: "Synthetic Show" }],
	// Non-string values still count as an attach target (the safe direction: more bodies need auth).
	["a numeric parentId", { url, parentId: 123 }],
	["a numeric podcastName", { url, podcastName: 42 }]
] as const;

function post(body: unknown, headers: Record<string, string> = authJsonHeaders) {
	return { method: "POST", headers, body: JSON.stringify(body) };
}

describe("POST /submit with news organisation / TV show parent fields", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		submissionsCreate.mockReset();
	});

	it.each(parentBodies)("%s without a token is 401, with no Azure call and no D1 write", async (_label, body) => {
		submissionsCreate.mockResolvedValue({});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload("/submit", "post", submit, null);

		const resp = await app.request("/submit", post(body, { "Content-Type": "application/json" }), testEnv());

		expect(resp.status).toBe(401);
		expect(await resp.json()).toEqual({ error: "Unauthorised" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it.each(parentBodies)("%s without submit or curate is 403, with no Azure call and no D1 write", async (_label, body) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/submit", "post", submit, ["admin"]);

		const resp = await app.request("/submit", post(body), testEnv());

		expect(resp.status).toBe(403);
		expect(await resp.json()).toEqual({ error: "Forbidden" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it.each(["submit", "curate"])("a %s caller's parent submit goes to Azure SubmitUrl with the parent fields, never D1", async (permission) => {
		const env = testEnv();
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: "Submitted" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/submit", "post", submit, [permission]);
		const body = { url, parentKind: "NewsOrganisation", parentId, parentName: "Synthetic Desk" };

		const resp = await app.request("/submit", post(body), env);

		expect(resp.status).toBe(200);
		expect(resp.headers.get("X-Origin")).toBe("true");
		expect(fetchMock).toHaveBeenCalledOnce();
		const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(String(calledUrl)).toBe(getEndpoint(Endpoint.submit, env).toString());
		expect(JSON.parse(String(init?.body))).toMatchObject(body);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("forwards Azure 404 for an unknown parent and does not fall back to D1", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
		const app = appWithPermissions("/submit", "post", submit, ["curate"]);

		const resp = await app.request("/submit", post({ url, parentKind: "TvShow", parentId }), testEnv());

		expect(resp.status).toBe(404);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it.each([
		["blank strings", { url, parentKind: "", parentId: "  ", parentName: "" }],
		["nulls", { url, parentKind: null, parentId: null, parentName: null }]
	] as const)("an anonymous URL-only body with %s for the parent fields is still D1-queued", async (_label, body) => {
		submissionsCreate.mockResolvedValue({});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload("/submit", "post", submit, null);

		const resp = await app.request("/submit", post(body, { "Content-Type": "application/json" }), testEnv());

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ success: "Submitted" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(submissionsCreate).toHaveBeenCalledOnce();
	});
});

describe("POST /submit OpenAPI request schema parent fields", () => {
	it("is the documented /submit body", () => {
		const request = SubmitRoute.openApiSchema.request as
			| { body?: { content?: { "application/json"?: { schema?: unknown } } } }
			| undefined;
		expect(request?.body?.content?.["application/json"]?.schema).toBe(submitUrlRequestSchema);
		expect(SubmitRoute.openApiSchema.description).toMatch(/parentKind, parentId or parentName/);
	});

	it("documents the parent-attach 400 and 404 outcomes from RPP #1054", () => {
		const responses = SubmitRoute.openApiSchema.responses;
		expect(responses?.[400]?.description).toMatch(/parentKind/);
		expect(responses?.[400]?.description).toMatch(/parentId/);
		expect(responses?.[400]?.description).toMatch(/podcastId/);
		expect(responses?.[404]?.description).toMatch(/`parentId` is not a row of `parentKind`/);
	});

	it("accepts NewsOrganisation / TvShow case-insensitively with a uuid parentId and a parentName", () => {
		for (const parentKind of ["NewsOrganisation", "TvShow", "newsorganisation", "TVSHOW"]) {
			expect(submitUrlRequestSchema.parse({ url, parentKind, parentId, parentName: "Synthetic Desk" })).toEqual({
				url,
				parentKind,
				parentId,
				parentName: "Synthetic Desk"
			});
		}
		expect(submitUrlRequestSchema.parse({ url, parentKind: null, parentId: null, parentName: null }).parentKind).toBeNull();
	});

	it("rejects other parent kinds and a non-uuid parentId", () => {
		expect(() => submitUrlRequestSchema.parse({ url, parentKind: "Podcast", parentId })).toThrow();
		expect(() => submitUrlRequestSchema.parse({ url, parentKind: "Film", parentId })).toThrow();
		expect(() => submitUrlRequestSchema.parse({ url, parentKind: "TvShow", parentId: "not-a-guid" })).toThrow();
	});
});
