import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getDiscoverySubmission,
	getDiscoverySubmissions,
	postDiscoverySubmissionApply,
	postDiscoverySubmissionRelease,
	postDiscoverySubmissionRetry,
	postDiscoverySubmissionState,
	postDiscoveryReportRelease,
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

	it.each([
		["retry", postDiscoverySubmissionRetry, { etag: "\"abc\"", abandonResultIds: [id] }],
		["release", postDiscoverySubmissionRelease, { etag: "\"abc\"", reason: "stale" }]
	] as const)("posts %s to Azure for a supervisor and forwards body", async (action, handler, request) => {
		const outcome = { submissionId: id, status: action === "release" ? "Released" : "Applied" };
		const fetchMock = stubAzure(200, outcome);
		const app = appWithPermissions(`/discovery-submissions/:id/${action}`, "post", handler, ["supervise"]);

		const resp = await app.request(
			`/discovery-submissions/${id}/${action}`,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify(request) },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(outcome);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe(`https://functions.example/api/DiscoverySubmissions/${id}/${action}`);
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual(request);
	});

	it.each([
		["retry", postDiscoverySubmissionRetry],
		["release", postDiscoverySubmissionRelease]
	] as const)("denies %s to curate:supervised without calling Azure", async (action, handler) => {
		const fetchMock = stubAzure(200, {});
		const app = appWithPermissions(`/discovery-submissions/:id/${action}`, "post", handler, ["curate:supervised", "curate"]);

		const resp = await app.request(
			`/discovery-submissions/${id}/${action}`,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ etag: "x" }) },
			testEnv()
		);

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		[400, { message: "not Failed", ids: [id] }],
		[409, { message: "nothing to retry" }],
		[500, { submissionId: id, status: "ApplyFailed", itemOutcomes: [] }]
	])("passes Azure retry %i and body through", async (status, body) => {
		stubAzure(status, body);
		const app = appWithPermissions("/discovery-submissions/:id/retry", "post", postDiscoverySubmissionRetry, ["admin"]);

		const resp = await app.request(
			`/discovery-submissions/${id}/retry`,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ etag: "e" }) },
			testEnv()
		);

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});

	it("admin releases a stuck report via DiscoveryReports", async () => {
		const body = { documentId: id, status: "Released", message: "ok" };
		const fetchMock = stubAzure(200, body);
		const app = appWithPermissions("/discovery-reports/:id/release", "post", postDiscoveryReportRelease, ["admin"]);

		const resp = await app.request(
			`/discovery-reports/${id}/release`,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ reason: "stuck" }) },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(body);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe(`https://functions.example/api/DiscoveryReports/${id}/release`);
		expect(JSON.parse(String(init?.body))).toEqual({ reason: "stuck" });
	});

	it.each([404, 409])("passes Azure report release %i through", async (status) => {
		const body = { documentId: id, status: status === 404 ? "NotFound" : "Conflict", submissionIds: [id] };
		stubAzure(status, body);
		const app = appWithPermissions("/discovery-reports/:id/release", "post", postDiscoveryReportRelease, ["admin"]);

		const resp = await app.request(
			`/discovery-reports/${id}/release`,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({}) },
			testEnv()
		);

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});

	it("denies report release to supervise without calling Azure", async () => {
		const fetchMock = stubAzure(200, {});
		const app = appWithPermissions("/discovery-reports/:id/release", "post", postDiscoveryReportRelease, ["supervise", "curate"]);

		const resp = await app.request(
			`/discovery-reports/${id}/release`,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({}) },
			testEnv()
		);

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	describe("permission matrix", () => {
		type Handler = (c: Parameters<typeof getDiscoverySubmissions>[0]) => Promise<Response>;
		const routes: { name: string; method: "get" | "put" | "post"; route: string; url: string; handler: Handler; allowed: string[]; success?: number }[] = [
			{ name: "list", method: "get", route: "/discovery-submissions", url: "/discovery-submissions", handler: getDiscoverySubmissions, allowed: ["curate:supervised", "supervise", "admin"] },
			{ name: "get", method: "get", route: "/discovery-submissions/:id", url: `/discovery-submissions/${id}`, handler: getDiscoverySubmission, allowed: ["curate:supervised", "supervise", "admin"] },
			{ name: "review", method: "put", route: "/discovery-submissions/:id/review", url: `/discovery-submissions/${id}/review`, handler: putDiscoverySubmissionReview, allowed: ["supervise", "admin"], success: 202 },
			{ name: "apply", method: "post", route: "/discovery-submissions/:id/apply", url: `/discovery-submissions/${id}/apply`, handler: postDiscoverySubmissionApply, allowed: ["supervise", "admin"] },
			{ name: "retry", method: "post", route: "/discovery-submissions/:id/retry", url: `/discovery-submissions/${id}/retry`, handler: postDiscoverySubmissionRetry, allowed: ["supervise", "admin"] },
			{ name: "release", method: "post", route: "/discovery-submissions/:id/release", url: `/discovery-submissions/${id}/release`, handler: postDiscoverySubmissionRelease, allowed: ["supervise", "admin"] },
			{ name: "state", method: "post", route: "/discovery-submissions/:id/state", url: `/discovery-submissions/${id}/state`, handler: postDiscoverySubmissionState, allowed: ["admin"] },
			{ name: "report release", method: "post", route: "/discovery-reports/:id/release", url: `/discovery-reports/${id}/release`, handler: postDiscoveryReportRelease, allowed: ["admin"] }
		];
		const permissions = ["curate", "curate:supervised", "supervise", "admin"];
		const cases = routes.flatMap((r) => permissions.map((p) => [r.name, p, r.allowed.includes(p), r] as const));

		it.each(cases)("%s with %s → allowed=%s", async (_name, permission, allowed, r) => {
			const fetchMock = stubAzure(r.success ?? 200, { ok: true });
			const app = appWithPermissions(r.route, r.method, r.handler, [permission]);

			const resp = await app.request(
				r.url,
				{
					method: r.method.toUpperCase(),
					headers: authJsonHeaders,
					...(r.method === "get" ? {} : { body: JSON.stringify({ etag: "e" }) })
				},
				testEnv()
			);

			if (allowed) {
				expect(resp.status).toBe(r.success ?? 200);
				expect(fetchMock).toHaveBeenCalledTimes(1);
			} else {
				expect(resp.status).toBe(403);
				expect(fetchMock).not.toHaveBeenCalled();
			}
		});
	});

	it("admin sets a submission state, forwarding status/etag/reason", async () => {
		const outcome = { submissionId: id, status: "Pending", etag: "\"n\"" };
		const fetchMock = stubAzure(200, outcome);
		const app = appWithPermissions("/discovery-submissions/:id/state", "post", postDiscoverySubmissionState, ["admin"]);
		const request = { status: "Pending", etag: "\"e\"", reason: "Apply crashed during claim" };

		const resp = await app.request(
			`/discovery-submissions/${id}/state`,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify(request) },
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(outcome);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe(`https://functions.example/api/DiscoverySubmissions/${id}/state`);
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual(request);
	});

	it.each([400, 403, 404, 409])("passes Azure state %i command body through", async (status) => {
		const body = { submissionId: id, status: "Applying", message: "nope" };
		stubAzure(status, body);
		const app = appWithPermissions("/discovery-submissions/:id/state", "post", postDiscoverySubmissionState, ["admin"]);

		const resp = await app.request(
			`/discovery-submissions/${id}/state`,
			{ method: "POST", headers: authJsonHeaders, body: JSON.stringify({ status: "Pending", etag: "e" }) },
			testEnv()
		);

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});
});
