import { afterEach, describe, expect, it, vi } from "vitest";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";
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

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(conflictIds);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("returns Azure 409 for name-only submit and flushes submit.azure_client_error", async () => {
		const env = testEnv();
		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify(conflictIds), { status: 409 })
		);
		vi.stubGlobal("fetch", fetchMock);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const app = appWithPermissions("/submit", "post", submit, ["submit"]);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ podcastName: "Shared Show Name" })
			},
			env
		);

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(conflictIds);
		expect(submissionsCreate).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe(env.secureSubmitEndpoint.toString());
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
			scope: "openid submit",
			azp: "m2m"
		} as Auth0JwtPayload);

		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ podcastName: "Shared Show Name" })
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

		expect(resp.status).toBe(404);
		expect(await resp.json()).toEqual(notFound);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("D1-queues when Azure returns 500 so public submit still accepts the URL", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("upstream failure", { status: 500 }))
		);
		submissionsCreate.mockResolvedValue({});
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

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ success: "Submitted" });
		expect(submissionsCreate).toHaveBeenCalledOnce();
	});

	it("D1-queues when the caller is unauthenticated", async () => {
		submissionsCreate.mockResolvedValue({});
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
		expect(submissionsCreate).toHaveBeenCalledOnce();
	});

	it("returns Azure 200 with X-Origin and does not write D1", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ message: "ok" }), { status: 200 }))
		);
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

		expect(resp.status).toBe(200);
		expect(resp.headers.get("X-Origin")).toBe("true");
		expect(submissionsCreate).not.toHaveBeenCalled();
	});
});
