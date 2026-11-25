import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));

import type { Env } from "../src/Env";
import type { ActionContext } from "../src/ActionContext";
import { search } from "../src/search";
import {
	D1PrimaryGiveUpStatus,
	D1SearchFetchError,
	SEARCH_PRIMARY_MAX_ATTEMPTS,
	SEARCH_PRIMARY_TIMEOUT_MS,
	SearchD1Index,
	SearchEngine,
	d1PrimaryIsRetriable,
	d1SearchFetcher,
	parseSearchD1Index,
	parseSearchPrimaryConfig,
	parseSearchPrimaryEngine
} from "../src/searchEngine";
import { testEnv } from "./honoTestApp";
import { parseJsonc } from "./jsonc";
import { AllowedOrigins } from "../src/AllowedOrigins";

const searchHost = "https://search.example/indexes/test/docs/search?api-version=2024-07-01";

function app() {
	const hono = new Hono<{ Bindings: Env }>();
	hono.post("/search", (c) => search(c as unknown as ActionContext));
	return hono;
}

function envelope(ids: string[], engine?: SearchEngine, count?: number) {
	return {
		value: ids.map((id) => ({ id })),
		"@odata.count": count ?? ids.length,
		...(engine ? { "@search.engine": engine } : {})
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

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers }
	});
}

function d1Fetcher(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return {
		fetch: vi.fn(async () => jsonResponse(body, status, headers))
	} as unknown as Fetcher;
}

function d1Sequence(...responses: Array<Response | Promise<Response>>) {
	const fetch = vi.fn();
	for (const response of responses) {
		fetch.mockImplementationOnce(async () => response);
	}
	return { fetch } as unknown as Fetcher;
}

function hungResponse(): Promise<Response> {
	return new Promise(() => { });
}

const upstreamUnavailable = {
	error: { code: "UpstreamSearchError", message: "Upstream search unavailable" },
	"@search.engine": SearchEngine.D1
};

const upstreamTimedOut = {
	error: { code: "UpstreamSearchError", message: "Upstream search timed out" },
	"@search.engine": SearchEngine.D1
};

function d1Raw(body: string, status = 200, contentType = "text/plain") {
	return {
		fetch: vi.fn(async () =>
			new Response(body, {
				status,
				headers: { "content-type": contentType }
			})
		)
	} as unknown as Fetcher;
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

function env(overrides: Partial<Env> = {}): Env {
	return testEnv({
		apihost: searchHost,
		apikey: "test-search-key",
		Data: { get: async () => null } as unknown as R2Bucket,
		...overrides
	} as Partial<Env>);
}

function expectCors(resp: Response) {
	expect(resp.headers.get("access-control-allow-origin")).toBe(AllowedOrigins[0]);
	expect(resp.headers.get("content-type")).toMatch(/^application\/json/);
}

async function postSearch(
	bindings: Env,
	init: { body?: unknown; headers?: Record<string, string>; executionCtx?: ExecutionContext } = {}
) {
	return app().request(
		"/search",
		{
			method: "POST",
			headers: { "content-type": "application/json", ...init.headers },
			body: JSON.stringify(init.body ?? { search: "x" })
		},
		bindings,
		init.executionCtx
	);
}

describe("parseSearchPrimaryConfig", () => {
	it("defaults to Azure and the production D1 index", () => {
		expect(parseSearchPrimaryConfig({})).toEqual({
			engine: SearchEngine.Azure,
			index: SearchD1Index.Production
		});
		expect(SearchEngine.Azure).toBe("azure");
		expect(SearchEngine.D1).toBe("d1");
		expect(SearchD1Index.Production).toBe("production");
		expect(SearchD1Index.Preview).toBe("preview");
	});

	it("accepts only the enum wire values; anything else is the default", () => {
		expect(parseSearchPrimaryEngine("d1")).toBe(SearchEngine.D1);
		expect(parseSearchPrimaryEngine("azure")).toBe(SearchEngine.Azure);
		expect(parseSearchPrimaryEngine("D1")).toBe(SearchEngine.Azure);
		expect(parseSearchPrimaryEngine("")).toBe(SearchEngine.Azure);
		expect(parseSearchD1Index("preview")).toBe(SearchD1Index.Preview);
		expect(parseSearchD1Index("production")).toBe(SearchD1Index.Production);
		expect(parseSearchD1Index("PREVIEW")).toBe(SearchD1Index.Production);
	});

	it("selects SEARCH for production and SEARCH_PREVIEW for preview, with no silent fallback", () => {
		const production = { fetch: vi.fn() } as unknown as Fetcher;
		const preview = { fetch: vi.fn() } as unknown as Fetcher;
		expect(d1SearchFetcher({ SEARCH: production, SEARCH_PREVIEW: preview, searchD1Index: "production" })).toBe(production);
		expect(d1SearchFetcher({ SEARCH: production, SEARCH_PREVIEW: preview, searchD1Index: "preview" })).toBe(preview);
	});

	it("retries only timeout, thrown fetch, and 5xx — not 400 or 429", () => {
		expect(SEARCH_PRIMARY_TIMEOUT_MS).toBe(3000);
		expect(SEARCH_PRIMARY_MAX_ATTEMPTS).toBe(2);
		expect(D1PrimaryGiveUpStatus.Timeout).toBe(504);
		expect(D1PrimaryGiveUpStatus.Unavailable).toBe(502);
		expect(d1PrimaryIsRetriable({ ok: false, error: D1SearchFetchError.Timeout, latencyMs: 10 })).toBe(true);
		expect(d1PrimaryIsRetriable({ ok: false, error: D1SearchFetchError.RequestFailed, latencyMs: 10, message: "boom" })).toBe(true);
		expect(d1PrimaryIsRetriable({ ok: false, error: D1SearchFetchError.Status, status: 503, latencyMs: 10 })).toBe(true);
		expect(d1PrimaryIsRetriable({ ok: false, error: D1SearchFetchError.Status, status: 500, latencyMs: 10 })).toBe(true);
		expect(d1PrimaryIsRetriable({ ok: false, error: D1SearchFetchError.Status, status: 400, latencyMs: 10 })).toBe(false);
		expect(d1PrimaryIsRetriable({ ok: false, error: D1SearchFetchError.Status, status: 429, latencyMs: 10 })).toBe(false);
		expect(d1PrimaryIsRetriable({ ok: false, error: D1SearchFetchError.Status, status: 404, latencyMs: 10 })).toBe(false);
		expect(d1PrimaryIsRetriable({ ok: false, error: D1SearchFetchError.NonJsonBody, status: 200, latencyMs: 10 })).toBe(false);
	});
});

describe("wrangler SP-4.1 switches", () => {
	const config = parseJsonc(readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8"));

	it("leaves production on Azure / production index", () => {
		expect(config.vars.searchPrimaryEngine).toBe(SearchEngine.Azure);
		expect(config.vars.searchD1Index).toBe(SearchD1Index.Production);
		expect(config.vars.searchPrimaryTimeoutMs).toBeUndefined();
		expect(config.env.local.vars.searchPrimaryEngine).toBe(SearchEngine.Azure);
		expect(config.env.local.vars.searchPrimaryTimeoutMs).toBeUndefined();
		expect(config.vars.searchShadowTimeoutMs).toBe("3000");
	});

	it("enables D1 as the served engine on api-preview, defaulting to the production index", () => {
		expect(config.env.preview.vars.searchPrimaryEngine).toBe(SearchEngine.D1);
		expect(config.env.preview.vars.searchD1Index).toBe(SearchD1Index.Production);
		expect(config.env.preview.vars.searchPrimaryTimeoutMs).toBeUndefined();
		expect(config.env.preview.services?.some((s: { binding: string; service: string }) => s.binding === "SEARCH" && s.service === "search")).toBe(true);
		expect(config.env.preview.services?.some((s: { binding: string; service: string }) => s.binding === "SEARCH_PREVIEW" && s.service === "search-preview")).toBe(true);
	});
});

describe("POST /search primary engine (SP-4.1)", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("serves Azure and does not call D1 when the switch is off", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		const d1 = d1Fetcher(envelope(["d1-1"], SearchEngine.D1));
		const resp = await postSearch(env({ SEARCH: d1 }));
		expect(resp.status).toBe(200);
		const body = await resp.json() as { "@search.engine": string; "@odata.context": unknown; value: { id: string }[] };
		expect(body["@search.engine"]).toBe(SearchEngine.Azure);
		expect(body["@odata.context"]).toBeNull();
		expect(body.value[0].id).toBe("azure-1");
		expect(azure).toHaveBeenCalledOnce();
		expect(d1.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
	});

	it("serves the D1 body with @search.engine d1, null @odata.context, CORS, and does not call Azure", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		const d1 = d1Fetcher({
			...envelope(["d1-1"], SearchEngine.D1),
			"@odata.context": "https://example/$metadata"
		});
		const infos: unknown[] = [];
		vi.spyOn(console, "info").mockImplementation((row: unknown) => { infos.push(row); });
		const resp = await postSearch(env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }));
		expect(resp.status).toBe(200);
		expectCors(resp);
		const body = await resp.json() as { "@search.engine": string; "@odata.context": unknown; value: { id: string }[] };
		expect(body["@search.engine"]).toBe(SearchEngine.D1);
		expect(body["@odata.context"]).toBeNull();
		expect(body.value[0].id).toBe("d1-1");
		expect(azure).not.toHaveBeenCalled();
		expect(infos).toEqual(expect.arrayContaining([
			expect.objectContaining({ engine: SearchEngine.D1, results: 1 })
		]));
	});

	it("uses SEARCH_PREVIEW when searchD1Index is preview", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		const production = d1Fetcher(envelope(["prod-1"], SearchEngine.D1));
		const preview = d1Fetcher(envelope(["preview-1"], SearchEngine.D1));
		const resp = await postSearch(env({
			searchPrimaryEngine: SearchEngine.D1,
			searchD1Index: SearchD1Index.Preview,
			SEARCH: production,
			SEARCH_PREVIEW: preview
		}));
		expect((await resp.json() as { value: { id: string }[] }).value[0].id).toBe("preview-1");
		expect(preview.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
		expect(production.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
		expect(azure).not.toHaveBeenCalled();
	});

	it("does not shadow D1 against itself when primary is D1, even if the sampler is on", async () => {
		stubAzure(envelope(["azure-1"]));
		const d1 = d1Fetcher(envelope(["d1-1"], SearchEngine.D1));
		vi.spyOn(console, "info").mockImplementation(() => { });
		const resp = await postSearch(env({
			searchPrimaryEngine: SearchEngine.D1,
			searchShadowEnabled: "true",
			searchShadowSampleRate: "1",
			SEARCH: d1
		}));
		expect(resp.status).toBe(200);
		expect(d1.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
	});

	it("retries once after a D1 timeout and serves success, without calling Azure", async () => {
		vi.useFakeTimers();
		const azure = stubAzure(envelope(["azure-1"]));
		const d1 = d1Sequence(hungResponse(), jsonResponse(envelope(["d1-1"], SearchEngine.D1)));
		const pending = postSearch(env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }));
		await vi.advanceTimersByTimeAsync(SEARCH_PRIMARY_TIMEOUT_MS);
		const resp = await pending;
		expect(resp.status).toBe(200);
		expectCors(resp);
		expect((await resp.json() as { value: { id: string }[] }).value[0].id).toBe("d1-1");
		expect(d1.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
		expect(azure).not.toHaveBeenCalled();
	});

	it("gives up with 504 after a timeout and one retried timeout, and logs requestId and attempts", async () => {
		vi.useFakeTimers();
		const azure = stubAzure(envelope(["azure-1"]));
		const errors: unknown[] = [];
		vi.spyOn(console, "error").mockImplementation((row: unknown) => { errors.push(row); });
		const d1 = d1Sequence(hungResponse(), hungResponse());
		const pending = postSearch(
			env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }),
			{ headers: { "cf-ray": "ray-timeout" } }
		);
		await vi.advanceTimersByTimeAsync(SEARCH_PRIMARY_TIMEOUT_MS);
		await vi.advanceTimersByTimeAsync(SEARCH_PRIMARY_TIMEOUT_MS);
		const resp = await pending;
		expect(resp.status).toBe(D1PrimaryGiveUpStatus.Timeout);
		expectCors(resp);
		expect(await resp.json()).toEqual(upstreamTimedOut);
		expect(d1.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
		expect(azure).not.toHaveBeenCalled();
		expect(errors).toEqual(expect.arrayContaining([
			expect.objectContaining({
				engine: SearchEngine.D1,
				attempts: 2,
				requestId: "ray-timeout",
				errors: expect.objectContaining({ searchStatus: D1PrimaryGiveUpStatus.Timeout })
			})
		]));
	});

	it("retries a D1 503 once and serves success, without calling Azure", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		const d1 = d1Sequence(
			jsonResponse({ error: { message: "unavailable" } }, 503),
			jsonResponse(envelope(["d1-1"], SearchEngine.D1))
		);
		const resp = await postSearch(env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }));
		expect(resp.status).toBe(200);
		expect((await resp.json() as { value: { id: string }[] }).value[0].id).toBe("d1-1");
		expect(d1.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
		expect(azure).not.toHaveBeenCalled();
	});

	it("gives up with 502 after a retried D1 503", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "error").mockImplementation(() => { });
		const d1 = d1Fetcher({ error: { message: "unavailable" } }, 503);
		const resp = await postSearch(env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }));
		expect(resp.status).toBe(D1PrimaryGiveUpStatus.Unavailable);
		expectCors(resp);
		expect(await resp.json()).toEqual(upstreamUnavailable);
		expect(d1.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
		expect(azure).not.toHaveBeenCalled();
	});

	it("forwards a D1 429 with Retry-After, stamps @search.engine d1, and does not retry or call Azure", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "error").mockImplementation(() => { });
		const d1Error = { error: { message: "rate limited" } };
		const d1 = d1Fetcher(d1Error, 429, { "retry-after": "7" });
		const resp = await postSearch(env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }));
		expect(resp.status).toBe(429);
		expectCors(resp);
		expect(resp.headers.get("retry-after")).toBe("7");
		expect(await resp.json()).toEqual({ ...d1Error, "@search.engine": SearchEngine.D1 });
		expect(d1.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
		expect(azure).not.toHaveBeenCalled();
	});

	it("returns 502 when D1 returns a non-JSON 200 and does not call Azure", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "error").mockImplementation(() => { });
		const d1 = d1Raw("not-json", 200);
		const resp = await postSearch(env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }));
		expect(resp.status).toBe(502);
		expectCors(resp);
		expect(await resp.json()).toEqual(upstreamUnavailable);
		expect(d1.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
		expect(azure).not.toHaveBeenCalled();
	});

	it("returns a D1 404 with @search.engine d1 and does not call Azure", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "error").mockImplementation(() => { });
		const d1Error = { error: { message: "not found" } };
		const d1 = d1Fetcher(d1Error, 404);
		const resp = await postSearch(env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }));
		expect(resp.status).toBe(404);
		expectCors(resp);
		expect(await resp.json()).toEqual({ ...d1Error, "@search.engine": SearchEngine.D1 });
		expect(d1.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
		expect(azure).not.toHaveBeenCalled();
	});

	it("retries once when the D1 fetch throws, then gives up with 502", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "error").mockImplementation(() => { });
		const d1 = { fetch: vi.fn(async () => { throw new Error("binding failed"); }) } as unknown as Fetcher;
		const resp = await postSearch(env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }));
		expect(resp.status).toBe(D1PrimaryGiveUpStatus.Unavailable);
		expectCors(resp);
		expect(await resp.json()).toEqual(upstreamUnavailable);
		expect(d1.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
		expect(azure).not.toHaveBeenCalled();
	});

	it("forwards a D1 400 with CORS, stamps @search.engine d1, and does not retry or call Azure", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "error").mockImplementation(() => { });
		const d1Error = { error: { message: "filter is invalid" } };
		const d1 = d1Fetcher(d1Error, 400);
		const resp = await postSearch(
			env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }),
			{ body: { search: "x", filter: "bad" } }
		);
		expect(resp.status).toBe(400);
		expectCors(resp);
		expect(await resp.json()).toEqual({ ...d1Error, "@search.engine": SearchEngine.D1 });
		expect(d1.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
		expect(azure).not.toHaveBeenCalled();
	});

	it("when primary is Azure, shadow uses the selected D1 index", async () => {
		stubAzure(envelope(["azure-1"]));
		const production = d1Fetcher(envelope(["prod-1"], SearchEngine.D1));
		const preview = d1Fetcher(envelope(["preview-1"], SearchEngine.D1));
		vi.spyOn(console, "info").mockImplementation(() => { });
		const { ctx, flush } = executionCtx();
		const resp = await postSearch(
			env({
				searchShadowEnabled: "true",
				searchShadowSampleRate: "1",
				searchD1Index: SearchD1Index.Preview,
				SEARCH: production,
				SEARCH_PREVIEW: preview
			}),
			{ executionCtx: ctx }
		);
		expect(resp.status).toBe(200);
		expect((await resp.json() as { "@search.engine": string })["@search.engine"]).toBe(SearchEngine.Azure);
		await flush();
		expect(preview.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
		expect(production.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
	});
});
