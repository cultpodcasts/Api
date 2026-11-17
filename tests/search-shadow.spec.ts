import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));

import type { Env } from "../src/Env";
import type { ActionContext } from "../src/ActionContext";
import { search } from "../src/search";
import {
	compareSearchSnapshots,
	DEFAULT_SEARCH_SHADOW_SAMPLE_RATE,
	DEFAULT_SEARCH_SHADOW_TOP_N,
	parseSearchShadowConfig,
	runSearchShadow,
	searchShadowUrl,
	shouldSampleShadow,
	snapshotSearchResponse,
	type SearchShadowLog
} from "../src/searchShadow";
import { testEnv } from "./honoTestApp";

const searchHost = "https://search.example/indexes/test/docs/search?api-version=2024-07-01";

function app() {
	const hono = new Hono<{ Bindings: Env }>();
	hono.post("/search", (c) => search(c as unknown as ActionContext));
	return hono;
}

function azureDoc(ids: string[], count?: number) {
	return {
		value: ids.map((id) => ({ id })),
		"@odata.count": count ?? ids.length
	};
}

function stubAzure(body: unknown, status = 200) {
	const fetchMock = vi.fn(async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" }
		})
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function executionCtx() {
	const tasks: Promise<unknown>[] = [];
	const ctx = {
		waitUntil(promise: Promise<unknown>) {
			tasks.push(promise);
		},
		passThroughOnException() { },
		props: {}
	} as unknown as ExecutionContext;
	return { ctx, flush: () => Promise.all(tasks) };
}

function shadowEnv(overrides: Partial<Env> = {}): Env {
	return testEnv({
		apihost: searchHost,
		apikey: "test-search-key",
		Data: { get: async () => null } as unknown as R2Bucket,
		searchShadowEnabled: "true",
		searchShadowSampleRate: "1",
		searchShadowTopN: "10",
		...overrides
	} as Partial<Env>);
}

describe("parseSearchShadowConfig", () => {
	it("defaults to a safe off kill switch and a low sample rate", () => {
		expect(parseSearchShadowConfig({})).toEqual({
			enabled: false,
			sampleRate: DEFAULT_SEARCH_SHADOW_SAMPLE_RATE,
			topN: DEFAULT_SEARCH_SHADOW_TOP_N
		});
	});

	it("parses booleans, clamps invalid rates and top-N to the defaults", () => {
		expect(parseSearchShadowConfig({ searchShadowEnabled: "YES", searchShadowSampleRate: "0.25", searchShadowTopN: "5" }))
			.toEqual({ enabled: true, sampleRate: 0.25, topN: 5 });
		expect(parseSearchShadowConfig({ searchShadowEnabled: "off" }).enabled).toBe(false);
		expect(parseSearchShadowConfig({ searchShadowSampleRate: "2" }).sampleRate).toBe(DEFAULT_SEARCH_SHADOW_SAMPLE_RATE);
		expect(parseSearchShadowConfig({ searchShadowSampleRate: "nope" }).sampleRate).toBe(DEFAULT_SEARCH_SHADOW_SAMPLE_RATE);
		expect(parseSearchShadowConfig({ searchShadowTopN: "0" }).topN).toBe(DEFAULT_SEARCH_SHADOW_TOP_N);
	});
});

describe("shouldSampleShadow", () => {
	it("is off when the kill switch is off or the rate is 0", () => {
		expect(shouldSampleShadow({ enabled: false, sampleRate: 1, topN: 10 }, () => 0)).toBe(false);
		expect(shouldSampleShadow({ enabled: true, sampleRate: 0, topN: 10 }, () => 0)).toBe(false);
	});

	it("samples when random is below the rate", () => {
		expect(shouldSampleShadow({ enabled: true, sampleRate: 0.01, topN: 10 }, () => 0.009)).toBe(true);
		expect(shouldSampleShadow({ enabled: true, sampleRate: 0.01, topN: 10 }, () => 0.01)).toBe(false);
	});
});

describe("searchShadowUrl", () => {
	it("reuses the Azure docs/search path on the service-binding origin", () => {
		expect(searchShadowUrl(searchHost)).toBe("https://search/indexes/test/docs/search?api-version=2024-07-01");
	});

	it("falls back when apihost is not a URL", () => {
		expect(searchShadowUrl("not a url")).toBe("https://search/indexes/episode/docs/search");
	});
});

describe("snapshot and overlap", () => {
	it("reads @odata.count and the leading ids", () => {
		const snap = snapshotSearchResponse(200, 12.4, azureDoc(["a", "b", "c"], 30), 2);
		expect(snap).toEqual({ status: 200, latencyMs: 12, count: 30, topIds: ["a", "b"] });
	});

	it("counts set overlap and whether the top lists match in order", () => {
		expect(compareSearchSnapshots(["a", "b", "c"], ["a", "b", "c"], 10)).toEqual({ topN: 10, matched: 3, sameOrder: true });
		expect(compareSearchSnapshots(["a", "b", "c"], ["c", "b", "a"], 10)).toEqual({ topN: 10, matched: 3, sameOrder: false });
		expect(compareSearchSnapshots(["a", "b"], ["a", "x"], 10)).toEqual({ topN: 10, matched: 1, sameOrder: false });
		expect(compareSearchSnapshots([], [], 10)).toEqual({ topN: 10, matched: 0, sameOrder: true });
	});
});

describe("runSearchShadow", () => {
	it("logs a compact comparison and records a D1 error without throwing", async () => {
		const logs: SearchShadowLog[] = [];
		const fetcher = {
			fetch: vi.fn(async () => {
				throw new TypeError("binding failed");
			})
		} as unknown as Fetcher;
		const payload = await runSearchShadow({
			fetcher,
			url: "https://search/indexes/test/docs/search",
			requestBody: JSON.stringify({ search: "Father's House" }),
			azure: snapshotSearchResponse(200, 20, azureDoc(["a"]), 10),
			topN: 10,
			requestId: "ray-1",
			query: "Father's House",
			log: (row) => logs.push(row)
		});
		expect(payload.message).toBe("search shadow");
		expect(payload.requestId).toBe("ray-1");
		expect(payload.query).toBe("Father's House");
		expect(payload.d1.error).toBe("binding failed");
		expect(payload.overlap.matched).toBe(0);
		expect(logs).toHaveLength(1);
		expect(JSON.stringify(payload)).not.toMatch(/ipAddress|userAgent|cf-connecting-ip/i);
	});
});

describe("POST /search shadow sampler", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns the Azure body even when D1 disagrees, and logs overlap off the request path", async () => {
		const azure = azureDoc(["azure-1", "azure-2"], 2);
		const d1 = azureDoc(["azure-1", "d1-2"], 5);
		stubAzure(azure);
		const d1Gate = deferred<Response>();
		let d1Started = false;
		const env = shadowEnv({
			SEARCH: {
				fetch: vi.fn(async (input: RequestInfo | URL) => {
					d1Started = true;
					expect(String(input)).toBe("https://search/indexes/test/docs/search?api-version=2024-07-01");
					return d1Gate.promise;
				})
			} as unknown as Fetcher
		});
		const { ctx, flush } = executionCtx();
		const logs: SearchShadowLog[] = [];
		const info = vi.spyOn(console, "info").mockImplementation((row: unknown) => {
			if (row && typeof row === "object" && "message" in row && (row as { message: string }).message === "search shadow") {
				logs.push(row as SearchShadowLog);
			}
		});
		vi.spyOn(console, "error").mockImplementation(() => { });

		const respPromise = app().request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json", "cf-ray": "shadow-ray" },
				body: JSON.stringify({ search: "Father's House", count: true })
			},
			env,
			ctx
		);
		const resp = await respPromise;
		expect(resp.status).toBe(200);
		const body = (await resp.json()) as { value: { id: string }[] };
		expect(body.value.map((h) => h.id)).toEqual(["azure-1", "azure-2"]);
		expect(logs).toHaveLength(0);
		expect(d1Started).toBe(true);

		d1Gate.resolve(new Response(JSON.stringify(d1), { status: 200, headers: { "content-type": "application/json" } }));
		await flush();
		expect(logs).toHaveLength(1);
		expect(logs[0].requestId).toBe("shadow-ray");
		expect(logs[0].query).toBe("Father's House");
		expect(logs[0].azure.count).toBe(2);
		expect(logs[0].d1.count).toBe(5);
		expect(logs[0].overlap).toEqual({ topN: 10, matched: 1, sameOrder: false });
		expect(logs[0].azure.topIds).toEqual(["azure-1", "azure-2"]);
		expect(logs[0].d1.topIds).toEqual(["azure-1", "d1-2"]);
		expect(typeof logs[0].azure.latencyMs).toBe("number");
		expect(typeof logs[0].d1.latencyMs).toBe("number");
		expect(JSON.stringify(logs[0])).not.toMatch(/ipAddress|userAgent/);
		info.mockRestore();
	});

	it("does not query D1 when the kill switch is off", async () => {
		stubAzure(azureDoc(["a"]));
		const searchFetch = vi.fn();
		const { ctx, flush } = executionCtx();
		const resp = await app().request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ search: "x" })
			},
			shadowEnv({ searchShadowEnabled: "false", SEARCH: { fetch: searchFetch } as unknown as Fetcher }),
			ctx
		);
		expect(resp.status).toBe(200);
		await flush();
		expect(searchFetch).not.toHaveBeenCalled();
	});

	it("does not query D1 when the sample rate is 0", async () => {
		stubAzure(azureDoc(["a"]));
		const searchFetch = vi.fn();
		const { ctx, flush } = executionCtx();
		const resp = await app().request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ search: "x" })
			},
			shadowEnv({ searchShadowSampleRate: "0", SEARCH: { fetch: searchFetch } as unknown as Fetcher }),
			ctx
		);
		expect(resp.status).toBe(200);
		await flush();
		expect(searchFetch).not.toHaveBeenCalled();
	});

	it("skips silently when the SEARCH binding is missing", async () => {
		stubAzure(azureDoc(["a"]));
		const { ctx, flush } = executionCtx();
		const resp = await app().request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ search: "x" })
			},
			shadowEnv({ SEARCH: undefined }),
			ctx
		);
		expect(resp.status).toBe(200);
		await flush();
		expect((await resp.json() as { value: { id: string }[] }).value[0].id).toBe("a");
	});

	it("still serves the Azure error when the shadow query fails", async () => {
		const azureError = { error: { message: "Could not find a property named 'notAField' on type 'search.document'." } };
		stubAzure(azureError, 400);
		const { ctx, flush } = executionCtx();
		const logs: SearchShadowLog[] = [];
		vi.spyOn(console, "info").mockImplementation((row: unknown) => {
			if (row && typeof row === "object" && "message" in row && (row as { message: string }).message === "search shadow") {
				logs.push(row as SearchShadowLog);
			}
		});
		vi.spyOn(console, "error").mockImplementation(() => { });
		const resp = await app().request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ search: "*", filter: "notAField eq 'x'" })
			},
			shadowEnv({
				SEARCH: {
					fetch: vi.fn(async () => {
						throw new TypeError("D1 down");
					})
				} as unknown as Fetcher
			}),
			ctx
		);
		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual(azureError);
		await flush();
		expect(logs).toHaveLength(1);
		expect(logs[0].d1.error).toBe("D1 down");
		expect(logs[0].azure.status).toBe(400);
	});
});
