import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getDiscoverySubmission,
	getDiscoverySubmissions,
	postDiscoverySubmissionApply,
	putDiscoverySubmissionReview
} from "../src/discoverySubmissions";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const id = "550e8400-e29b-41d4-a716-446655440000";

function stubAzure(status: number, body: unknown) {
	const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
		new Response(JSON.stringify(body), { status }));
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("discovery-submissions proxy", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each(["supervise", "admin", "curate:supervised"])("lists submissions for %s", async (permission) => {
		const body = { view: "submitter", pendingCount: 1, submissions: [] };
		const fetchMock = stubAzure(200, body);
		const app = appWithPermissions("/discovery-submissions", "get", getDiscoverySubmissions, [permission]);

		const resp = await app.request("/discovery-submissions", { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(body);
		expect(String(fetchMock.mock.calls[0][0])).toBe("https://functions.example/api/DiscoverySubmissions");
	});

	it("denies list to a plain curator without calling Azure", async () => {
		const fetchMock = stubAzure(200, {});
		const app = appWithPermissions("/discovery-submissions", "get", getDiscoverySubmissions, ["curate"]);

		const resp = await app.request("/discovery-submissions", { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("gets a submission by id, passing etag through", async () => {
		const body = { id, status: "Pending", etag: "\"abc\"" };
		const fetchMock = stubAzure(200, body);
		const app = appWithPermissions("/discovery-submissions/:id", "get", getDiscoverySubmission, ["curate:supervised"]);

		const resp = await app.request(`/discovery-submissions/${id}`, { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(body);
		expect(String(fetchMock.mock.calls[0][0])).toBe(`https://functions.example/api/DiscoverySubmissions/${id}`);
	});

	it.each([403, 404])("forwards Azure %i on get", async (status) => {
		stubAzure(status, { message: "nope" });
		const app = appWithPermissions("/discovery-submissions/:id", "get", getDiscoverySubmission, ["supervise"]);

		const resp = await app.request(`/discovery-submissions/${id}`, { method: "GET", headers: authJsonHeaders }, testEnv());

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual({ message: "nope" });
	});

	it("puts a review to Azure and returns the 202 command outcome", async () => {
		const outcome = { submissionId: id, status: "Pending", etag: "\"def\"" };
		const fetchMock = stubAzure(202, outcome);
		const app = appWithPermissions("/discovery-submissions/:id/review", "put", putDiscoverySubmissionReview, ["supervise"]);
		const request = { etag: "\"abc\"", reportComment: "ok", acceptedResultIds: [id] };

		const resp = await app.request(
			`/discovery-submissions/${id}/review`,
			{ method: "PUT", headers: authJsonHeaders, body: JSON.stringify(request) },
			testEnv()
		);

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(outcome);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe(`https://functions.example/api/DiscoverySubmissions/${id}/review`);
		expect(init?.method).toBe("PUT");
		expect(JSON.parse(String(init?.body))).toEqual(request);
	});

	it("denies review to curate:supervised without calling Azure", async () => {
		const fetchMock = stubAzure(202, {});
		const app = appWithPermissions("/discovery-submissions/:id/review", "put", putDiscoverySubmissionReview, ["curate:supervised", "curate"]);

		const resp = await app.request(
			`/discovery-submissions/${id}/review`,
			{ method: "PUT", headers: authJsonHeaders, body: JSON.stringify({ etag: "x" }) },
			testEnv()
		);

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		[200, { submissionId: id, status: "Applied", outcome: { message: "ok", errorsOccurred: false, results: [] } }],
		[400, { message: "ids outside held reports" }],
		[409, { message: "stale etag" }],
		[500, { submissionId: id, status: "ApplyFailed", message: "ingest failed" }]
	])("passes Azure apply %i and body through", async (status, body) => {
		const fetchMock = stubAzure(status, body);
		const app = appWithPermissions("/discovery-submissions/:id/apply", "post", postDiscoverySubmissionApply, ["admin"]);

		const resp = await app.request(
			`/discovery-submissions/${id}/apply`,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ etag: "\"abc\"" }) },
			testEnv()
		);

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe(`https://functions.example/api/DiscoverySubmissions/${id}/apply`);
		expect(init?.method).toBe("POST");
	});
});
