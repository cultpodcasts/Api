import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import worker from "../src/index";
import { deleteNewsOrganisation } from "../src/deleteNewsOrganisation";
import { DeleteNewsOrganisationRoute } from "../src/openapiRoutes";
import { newsOrganisationDeleteConflictSchema, newsOrganisationDeleteQuerySchema } from "../src/openapiSchemas";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";
import { testEnv as auth0TestEnv } from "./support/honoRoute";

const organisationId = "3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c";
const targetId = "6c5d4e3f-2a1b-4c0d-9e8f-7a6b5c4d3e2f";
const deletePath = `/newsorganisation/${organisationId}`;
const route = "/newsorganisation/:id";

type JsonContent = { description?: string; content?: { "application/json"?: { schema?: unknown } } };

function adminApp() {
	return appWithPermissions(route, "delete", deleteNewsOrganisation, ["admin"]);
}

describe("delete news organisation proxy", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns 403 with curate only (admin required) and does not call Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(route, "delete", deleteNewsOrganisation, ["curate", "submit"]);

		const resp = await app.request(deletePath, { method: "DELETE", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("proxies DELETE to Azure with admin and returns 200 with an empty body, sending no query when none is given", async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await adminApp().request(deletePath, { method: "DELETE", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(200);
		expect(await resp.text()).toBe("");
		const [url, init] = fetchMock.mock.calls[0] as unknown as [URL | string, RequestInit];
		expect(String(url).endsWith(`/api/newsorganisation/${organisationId}`)).toBe(true);
		expect(init.method).toBe("DELETE");
	});

	it("forwards only redirectToNewsOrganisationId from the query to Azure", async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await adminApp().request(
			`${deletePath}?redirectToNewsOrganisationId=${targetId}&other=dropped`,
			{ method: "DELETE", headers: authJsonHeaders },
			testEnv()
		);

		expect(resp.status).toBe(200);
		const [url] = fetchMock.mock.calls[0] as unknown as [URL | string, RequestInit];
		expect(String(url).endsWith(`/api/newsorganisation/${organisationId}?redirectToNewsOrganisationId=${targetId}`)).toBe(true);
	});

	it("forwards Azure's 404 with its empty body", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

		const resp = await adminApp().request(deletePath, { method: "DELETE", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(404);
		expect(await resp.text()).toBe("");
	});

	it.each([
		[400, { error: "A redirect from 'Old' to 'New' would loop. Nothing was deleted" }],
		[409, { message: "The news organisation still has reports. Move them first", remainingReportCount: 3 }],
		[409, { message: "The news organisation is being indexed. Retry in a few minutes", retryable: true }],
		[500, { error: "Unable to delete news organisation" }]
	] as const)("forwards Azure %s with its body", async (status, body) => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

		const resp = await adminApp().request(deletePath, { method: "DELETE", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});
});

describe("delete news organisation OpenAPI contract", () => {
	it("documents admin auth, the redirect query, empty 200 and 404 bodies, and the 409 body", () => {
		const schema = DeleteNewsOrganisationRoute.openApiSchema;
		expect(schema.security).toEqual([{ bearerAuth: [] }]);
		expect(schema.responses?.[403]?.description).toMatch(/without `admin`/);
		expect((schema.request as { query?: unknown } | undefined)?.query).toBe(newsOrganisationDeleteQuerySchema);
		expect((schema.responses?.[200] as JsonContent | undefined)?.content).toBeUndefined();
		const notFound = schema.responses?.[404] as JsonContent | undefined;
		expect(notFound?.content).toBeUndefined();
		expect(notFound?.description).toMatch(/empty body/);
		expect(schema.responses?.[400]).toBeDefined();
		const conflict = schema.responses?.[409] as JsonContent | undefined;
		expect(conflict?.content?.["application/json"]?.schema).toBe(newsOrganisationDeleteConflictSchema);
		expect(schema.description ?? "").toMatch(/redirectToNewsOrganisationId/);
	});

	it("accepts a 409 body without remainingReportCount (being indexed) and a guid-only redirect query", () => {
		expect(newsOrganisationDeleteConflictSchema.parse({ message: "busy", retryable: true }).retryable).toBe(true);
		expect(newsOrganisationDeleteConflictSchema.parse({ message: "busy", retryable: true }).remainingReportCount).toBeUndefined();
		expect(newsOrganisationDeleteQuerySchema.parse({ redirectToNewsOrganisationId: targetId }).redirectToNewsOrganisationId).toBe(targetId);
		expect(() => newsOrganisationDeleteQuerySchema.parse({ redirectToNewsOrganisationId: "not-a-guid" })).toThrow();
	});
});

describe("delete news organisation on the Worker app", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("routes DELETE behind auth (401 without a token, not 404) and does not call Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const resp = await worker.fetch(
			new Request(`https://api.example${deletePath}`, { method: "DELETE" }),
			auth0TestEnv(),
			{} as ExecutionContext
		);
		expect(resp.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});