import { afterEach, describe, expect, it, vi } from "vitest";
import { submit } from "../src/submit";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

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

describe("submit", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		submissionsCreate.mockReset();
	});

	it("returns Azure 409 UUID list and does not D1-queue as Submitted", async () => {
		const ids = [
			"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
		];
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(ids), { status: 409 }))
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
		expect(await resp.json()).toEqual(ids);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("returns Azure 404 and does not D1-queue as Submitted", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ message: "Podcast not found" }), { status: 404 }))
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
