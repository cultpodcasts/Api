import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));

import type { Env } from "../src/Env";
import type { ActionContext } from "../src/ActionContext";
import { search } from "../src/search";
import {
	DEFAULT_SEARCH_PRIMARY_TIMEOUT_MS,
	D1SearchFetchError,
	SearchD1Index,
	SearchEngine,
	d1PrimaryIsUnavailable,
	d1SearchFetcher,
	parseSearchD1Index,
	parseSearchPrimaryConfig,
	parseSearchPrimaryEngine,
	parseSearchPrimaryTimeoutMs
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

function d1Fetcher(body: unknown, status = 200) {
	return {
		fetch: vi.fn(async () =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" }
			})
		)
	} as unknown as Fetcher;
}

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
		expect(d1SearchFetcher({ SEARCH: production, searchD1Index: "preview" })).toBeUndefined();
		expect(d1SearchFetcher({ SEARCH_PREVIEW: preview })).toBeUndefined();
	});

	it("forwards only a D1 400; every other fetch failure is unavailable", () => {
		expect(d1PrimaryIsUnavailable({ ok: false, error: D1SearchFetchError.Timeout, latencyMs: 10 })).toBe(true);
		expect(d1PrimaryIsUnavailable({ ok: false, error: D1SearchFetchError.Status, status: 503, latencyMs: 10 })).toBe(true);
		expect(d1PrimaryIsUnavailable({ ok: false, error: D1SearchFetchError.Status, status: 429, latencyMs: 10 })).toBe(true);
		expect(d1PrimaryIsUnavailable({ ok: false, error: D1SearchFetchError.Status, status: 404, latencyMs: 10 })).toBe(true);
		expect(d1PrimaryIsUnavailable({ ok: false, error: D1SearchFetchError.NonJsonBody, status: 200, latencyMs: 10 })).toBe(true);
		expect(d1PrimaryIsUnavailable({ ok: false, error: D1SearchFetchError.MissingBinding, latencyMs: 0 })).toBe(true);
		expect(d1PrimaryIsUnavailable({ ok: false, error: D1SearchFetchError.Status, status: 400, latencyMs: 10, body: { error: "Bad request" } })).toBe(false);
	});

	it("parses searchPrimaryTimeoutMs independently of the shadow timeout", () => {
		expect(parseSearchPrimaryTimeoutMs(undefined)).toBe(DEFAULT_SEARCH_PRIMARY_TIMEOUT_MS);
		expect(parseSearchPrimaryTimeoutMs("5000")).toBe(5000);
		expect(parseSearchPrimaryTimeoutMs("50")).toBe(DEFAULT_SEARCH_PRIMARY_TIMEOUT_MS);
		expect(parseSearchPrimaryTimeoutMs("nope")).toBe(DEFAULT_SEARCH_PRIMARY_TIMEOUT_MS);
	});
});

describe("wrangler SP-4.1 switches", () => {
	const config = parseJsonc(readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8"));

	it("leaves production on Azure / production index", () => {
		expect(config.vars.searchPrimaryEngine).toBe(SearchEngine.Azure);
		expect(config.vars.searchD1Index).toBe(SearchD1Index.Production);
		expect(config.vars.searchPrimaryTimeoutMs).toBe("3000");
		expect(config.env.local.vars.searchPrimaryEngine).toBe(SearchEngine.Azure);
		expect(config.env.local.vars.searchPrimaryTimeoutMs).toBe("3000");
	});

	it("enables D1 as the served engine on api-preview, defaulting to the production index", () => {
		expect(config.env.preview.vars.searchPrimaryEngine).toBe(SearchEngine.D1);
		expect(config.env.preview.vars.searchD1Index).toBe(SearchD1Index.Production);
		expect(config.env.preview.vars.searchPrimaryTimeoutMs).toBe("3000");
		expect(config.env.preview.services?.some((s: { binding: string; service: string }) => s.binding === "SEARCH" && s.service === "search")).toBe(true);
		expect(config.env.preview.services?.some((s: { binding: string; service: string }) => s.binding === "SEARCH_PREVIEW" && s.service === "search-preview")).toBe(true);
	});
});

describe("POST /search primary engine (SP-4.1)", () => {
	afterEach(() => {
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
			expect.objectContaining({ engine: SearchEngine.D1 })
		]));
		const log = infos.find((row) => typeof row === "object" && row !== null && "engine" in row) as { d1Fallback?: string };
		expect(log.d1Fallback).toBeUndefined();
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

	it("falls back to Azure when D1 times out, logs requestId, and records engine + d1Fallback", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		const warnings: unknown[] = [];
		const infos: unknown[] = [];
		vi.spyOn(console, "warn").mockImplementation((row: unknown) => { warnings.push(row); });
		vi.spyOn(console, "info").mockImplementation((row: unknown) => { infos.push(row); });
		const hung = { fetch: vi.fn(() => new Promise<Response>(() => {})) } as unknown as Fetcher;
		const resp = await postSearch(
			env({
				searchPrimaryEngine: SearchEngine.D1,
				searchPrimaryTimeoutMs: "50",
				SEARCH: hung
			}),
			{ headers: { "cf-ray": "ray-timeout" } }
		);
		expect(resp.status).toBe(200);
		const body = await resp.json() as { "@search.engine": string; value: { id: string }[] };
		expect(body["@search.engine"]).toBe(SearchEngine.Azure);
		expect(body.value[0].id).toBe("azure-1");
		expect(azure).toHaveBeenCalledOnce();
		expect(warnings).toEqual(expect.arrayContaining([
			expect.objectContaining({
				message: "search d1 primary fallback",
				error: "timeout",
				requestId: "ray-timeout"
			})
		]));
		expect(infos).toEqual(expect.arrayContaining([
			expect.objectContaining({ engine: SearchEngine.Azure, d1Fallback: "timeout", requestId: "ray-timeout" })
		]));
	});

	it("falls back to Azure when D1 returns 503", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "warn").mockImplementation(() => { });
		const d1 = d1Fetcher({ error: { message: "unavailable" } }, 503);
		const resp = await postSearch(env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }));
		const body = await resp.json() as { "@search.engine": string; value: { id: string }[] };
		expect(body["@search.engine"]).toBe(SearchEngine.Azure);
		expect(body.value[0].id).toBe("azure-1");
		expect(azure).toHaveBeenCalledOnce();
	});

	it("falls back to Azure when D1 returns 429", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "warn").mockImplementation(() => { });
		const d1 = d1Fetcher({ error: { message: "rate limited" } }, 429);
		const resp = await postSearch(env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }));
		const body = await resp.json() as { "@search.engine": string; "@odata.context": unknown; value: { id: string }[] };
		expect(resp.status).toBe(200);
		expect(body["@search.engine"]).toBe(SearchEngine.Azure);
		expect(body["@odata.context"]).toBeNull();
		expect(body.value[0].id).toBe("azure-1");
		expect(azure).toHaveBeenCalledOnce();
	});

	it("falls back to Azure when D1 returns a non-JSON 200", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "warn").mockImplementation(() => { });
		const d1 = d1Raw("not-json", 200);
		const resp = await postSearch(env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }));
		const body = await resp.json() as { "@search.engine": string; value: { id: string }[] };
		expect(resp.status).toBe(200);
		expect(body["@search.engine"]).toBe(SearchEngine.Azure);
		expect(body.value[0].id).toBe("azure-1");
		expect(azure).toHaveBeenCalledOnce();
	});

	it("falls back to Azure when D1 returns 404", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "warn").mockImplementation(() => { });
		const d1 = d1Fetcher({ error: { message: "not found" } }, 404);
		const resp = await postSearch(env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }));
		expect(resp.status).toBe(200);
		expect((await resp.json() as { "@search.engine": string })["@search.engine"]).toBe(SearchEngine.Azure);
		expect(azure).toHaveBeenCalledOnce();
	});

	it("falls back to Azure when the selected D1 binding is missing", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "warn").mockImplementation(() => { });
		const resp = await postSearch(env({ searchPrimaryEngine: SearchEngine.D1, searchD1Index: SearchD1Index.Preview }));
		const body = await resp.json() as { "@search.engine": string; value: { id: string }[] };
		expect(body.value[0].id).toBe("azure-1");
		expect(azure).toHaveBeenCalledOnce();
	});

	it("forwards a D1 400 with CORS and does not fall back to Azure", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		const d1Error = { error: { message: "filter is invalid" } };
		const d1 = d1Fetcher(d1Error, 400);
		const resp = await postSearch(
			env({ searchPrimaryEngine: SearchEngine.D1, SEARCH: d1 }),
			{ body: { search: "x", filter: "bad" } }
		);
		expect(resp.status).toBe(400);
		expectCors(resp);
		expect(await resp.json()).toEqual(d1Error);
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
