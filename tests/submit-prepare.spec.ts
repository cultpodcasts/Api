import { afterEach, describe, expect, it, vi } from "vitest";
import { submitPrepare } from "../src/submitPrepare";
import { submit } from "../src/submit";
import { streamMetaKvKey } from "../src/submitPrepareMeta";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

describe("submitPrepare", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns 401 when unauthenticated", async () => {
		const app = appWithPermissions("/submit/prepare", "post", submitPrepare, []);
		// empty permissions with null payload via override
		const { appWithAuthPayload } = await import("./honoTestApp");
		const unauth = appWithAuthPayload("/submit/prepare", "post", submitPrepare, null);
		const resp = await unauth.request(
			"/submit/prepare",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: "https://www.itv.com/watch/x/1/1" })
			},
			testEnv()
		);
		expect(resp.status).toBe(401);
		expect(app).toBeTruthy();
	});

	it("uses Azure prepare (directHttp) when service is not on BR allowlist and caches meta", async () => {
		const put = vi.fn(async () => undefined);
		const env = testEnv({
			browserRenderingServices: "",
			StreamMeta: { get: async () => null, put } as unknown as KVNamespace
		});
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const u = String(input);
			if (u.includes("SubmitUrl") && !u.includes("/prepare") && !u.includes("/extract")) {
				return new Response(
					JSON.stringify({ known: false, kind: "streaming", service: "netflix" }),
					{ status: 200 }
				);
			}
			if (u.includes("/prepare")) {
				return new Response(
					JSON.stringify({
						service: "netflix",
						podcastName: "Extracted Show",
						title: "Episode Title",
						description: "Desc"
					}),
					{ status: 200 }
				);
			}
			return new Response("unexpected", { status: 500 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const app = appWithPermissions("/submit/prepare", "post", submitPrepare, ["submit"]);
		const url = "https://www.netflix.com/watch/80057281";
		const resp = await app.request(
			"/submit/prepare",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ url })
			},
			env
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({
			service: "netflix",
			htmlFetchMode: "directHttp",
			podcastName: "Extracted Show",
			title: "Episode Title"
		});
		expect(put).toHaveBeenCalledWith(
			streamMetaKvKey(url),
			expect.stringContaining("Extracted Show"),
			expect.objectContaining({ expirationTtl: 15 * 60 })
		);
	});

	it("returns 400 when lookup kind is not streaming", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response(JSON.stringify({ known: false, kind: "podcast-service" }), {
					status: 200
				})
			)
		);
		const app = appWithPermissions("/submit/prepare", "post", submitPrepare, ["curate"]);
		const resp = await app.request(
			"/submit/prepare",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ url: "https://open.spotify.com/episode/x" })
			},
			testEnv({ StreamMeta: { put: vi.fn() } as unknown as KVNamespace })
		);
		expect(resp.status).toBe(400);
	});
});

describe("submit prefetchedMeta inject", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("injects KV meta and strips client prefetchedMeta", async () => {
		const url = "https://www.itv.com/watch/example/1/1";
		const cached = {
			service: "itvx",
			podcastName: "Show",
			title: "Ep",
			description: "D"
		};
		const env = testEnv({
			StreamMeta: {
				get: async () => cached,
				put: async () => undefined
			} as unknown as KVNamespace
		});
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				const body = JSON.parse(String(init?.body ?? "{}"));
				expect(body.prefetchedMeta).toEqual({
					title: "Ep",
					description: "D",
					duration: undefined,
					release: undefined,
					image: undefined,
					explicit: undefined,
					publisher: undefined,
					showName: undefined
				});
				expect(body.clientMeta).toBeUndefined();
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			}
		);
		vi.stubGlobal("fetch", fetchMock);

		const app = appWithPermissions("/submit", "post", submit, ["submit"]);
		const resp = await app.request(
			"/submit",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					url,
					prefetchedMeta: { title: "evil", description: "no" }
				})
			},
			env
		);
		expect(resp.status).toBe(200);
		expect(fetchMock).toHaveBeenCalled();
	});
});
