import { afterEach, describe, expect, it, vi } from "vitest";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";
import { Endpoint } from "../src/Endpoint";
import { getEndpoint } from "../src/endpoints";
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

const conflictIds = [
	"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
];

describe("submit", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		submissionsCreate.mockReset();
	});

	it("returns Azure 409 UUID list and does not D1-queue as Submitted", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(conflictIds), { status: 409 }))
		);
		const app = appWithPermissions("/submit", "post", submit, ["curate", "submit"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ url: "https://example.com/episode" })
			},
			testEnv()
		);

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(conflictIds);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("returns Azure 409 for attach-by-name with url and flushes submit.azure_client_error", async () => {
		const env = testEnv();
		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify(conflictIds), { status: 409 })
		);
		vi.stubGlobal("fetch", fetchMock);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const app = appWithPermissions("/submit", "post", submit, ["curate", "submit"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					url: "https://example.com/episode",
					podcastName: "Shared Show Name"
				})
			},
			env
		);

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(conflictIds);
		expect(submissionsCreate).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe(getEndpoint(Endpoint.submit, env).toString());
		expect(warnSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "submit.azure_client_error",
				status: 409
			})
		);
	});

	it("proxies Azure 409 when submit is granted via OAuth scope only", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(conflictIds), { status: 409 }))
		);
		const app = appWithAuthPayload("/submit", "post", submit, {
			scope: "openid curate submit",
			azp: "m2m"
		} as Auth0JwtPayload);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					url: "https://example.com/episode",
					podcastName: "Shared Show Name"
				})
			},
			testEnv()
		);

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(conflictIds);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("returns Azure 404 body and does not D1-queue as Submitted", async () => {
		const notFound = { message: "Podcast not found" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(notFound), { status: 404 }))
		);
		const app = appWithPermissions("/submit", "post", submit, ["curate", "submit"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ url: "https://example.com/episode" })
			},
			testEnv()
		);

		expect(resp.status).toBe(404);
		expect(await resp.json()).toEqual(notFound);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("returns Azure 400 for binding/missing Url and does not D1-queue", async () => {
		const azureBody = { error: "Required property 'Url' not found in JSON. Path ''." };
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(azureBody), { status: 400 }))
		);
		const app = appWithPermissions("/submit", "post", submit, ["curate", "submit"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ url: "https://example.com/episode" })
			},
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual(azureBody);
		expect(submissionsCreate).not.toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "submit.azure_client_error",
				status: 400
			})
		);
	});

	it("returns Azure 400 for name-only submit when Url is required and does not D1-queue", async () => {
		const fetchMock = vi.fn(
			async () => new Response("Required property 'Url' not found in JSON.", { status: 400 })
		);
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/submit", "post", submit, ["curate", "submit"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ podcastName: "Shared Show Name" })
			},
			testEnv()
		);

		expect(resp.status).toBe(400);
		expect(await resp.text()).toContain("Url");
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("does not retry Isolated Azure 500 even when a second call would succeed", async () => {
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response("upstream failure", { status: 500 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ message: "ok" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/submit", "post", submit, ["curate"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					url: "https://example.com/episode",
					podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
					podcastName: "Example Show"
				})
			},
			testEnv()
		);

		expect(resp.status).toBe(500);
		expect(await resp.json()).toEqual({ error: "Error" });
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("returns Worker 500 for authenticated URL-only submit when Azure returns 500 and does not D1-queue", async () => {
		const fetchMock = vi.fn(async () => new Response("upstream failure", { status: 500 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/submit", "post", submit, ["curate"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ url: "https://example.com/episode" })
			},
			testEnv()
		);

		expect(resp.status).toBe(500);
		expect(await resp.json()).toEqual({ error: "Error" });
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("returns Azure 422 once and does not D1-queue or retry", async () => {
		const disposition = { error: "RequiresCurator" };
		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify(disposition), { status: 422 })
		);
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/submit", "post", submit, ["submit"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ url: "https://example.com/episode" })
			},
			testEnv()
		);

		expect(resp.status).toBe(422);
		expect(await resp.json()).toEqual(disposition);
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("retries Azure once after gateway 502 and does not D1-queue when the retry succeeds", async () => {
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ message: "ok" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/submit", "post", submit, ["curate"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ url: "https://example.com/episode" })
			},
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(resp.headers.get("X-Origin")).toBe("true");
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it.each([502, 503] as const)(
		"retries upstream %s once and does not D1-queue when the gateway error persists",
		async (status) => {
			const fetchMock = vi.fn(async () => new Response("bad gateway", { status }));
			vi.stubGlobal("fetch", fetchMock);
			const app = appWithPermissions("/submit", "post", submit, ["submit"]);

			const resp = await app.request(
				"/submit",
				{
					method: "POST",
					headers: authJsonHeaders,
					body: JSON.stringify({ url: "https://example.com/episode" })
				},
				testEnv()
			);

			expect(resp.status).toBe(500);
			expect(await resp.json()).toEqual({ error: "Error" });
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(submissionsCreate).not.toHaveBeenCalled();
		}
	);

	it("retries a thrown fetch once and does not D1-queue when the retry succeeds", async () => {
		const fetchMock = vi.fn()
			.mockRejectedValueOnce(new TypeError("network"))
			.mockResolvedValueOnce(new Response(JSON.stringify({ message: "ok" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/submit", "post", submit, ["curate", "submit"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ url: "https://example.com/episode" })
			},
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(resp.headers.get("X-Origin")).toBe("true");
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("returns 403 for podcastName attach when authenticated without submit or curate", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/submit", "post", submit, ["admin"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ podcastName: "Example Show" })
			},
			testEnv()
		);

		expect(resp.status).toBe(403);
		expect(await resp.json()).toEqual({ error: "Forbidden" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("does not D1-queue attach-by-id as Submitted when the caller is unauthenticated", async () => {
		submissionsCreate.mockResolvedValue({});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload("/submit", "post", submit, null);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: "https://example.com/episode",
					podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
					podcastName: "Example Show"
				})
			},
			testEnv()
		);

		expect(resp.status).toBe(401);
		expect(await resp.json()).toEqual({ error: "Unauthorised" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("D1-queues when the caller is unauthenticated", async () => {
		submissionsCreate.mockResolvedValue({});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithAuthPayload("/submit", "post", submit, null);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: "https://example.com/episode" })
			},
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ success: "Submitted" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(submissionsCreate).toHaveBeenCalledOnce();
	});

	it("fetches Azure SubmitUrl when the caller has submit permission only", async () => {
		const env = testEnv();
		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify(conflictIds), { status: 409 })
		);
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/submit", "post", submit, ["submit"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ url: "https://example.com/episode" })
			},
			env
		);

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(conflictIds);
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe(getEndpoint(Endpoint.submit, env).toString());
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("fetches Azure SubmitUrl when Curator has curate permission only", async () => {
		const env = testEnv();
		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify(conflictIds), { status: 409 })
		);
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions("/submit", "post", submit, ["curate"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ url: "https://example.com/episode" })
			},
			env
		);

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(conflictIds);
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe(getEndpoint(Endpoint.submit, env).toString());
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("returns Azure 200 with X-Origin and does not write D1", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ message: "ok" }), { status: 200 }))
		);
		const app = appWithPermissions("/submit", "post", submit, ["curate", "submit"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ url: "https://example.com/episode" })
			},
			testEnv()
		);

		expect(resp.status).toBe(200);
		expect(resp.headers.get("X-Origin")).toBe("true");
		expect(submissionsCreate).not.toHaveBeenCalled();
	});
});
