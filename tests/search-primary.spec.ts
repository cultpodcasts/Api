import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));

import type { Env } from "../src/Env";
import type { ActionContext } from "../src/ActionContext";
import { search } from "../src/search";
import {
	SearchD1Index,
	SearchPrimaryEngine,
	d1PrimaryIsUnavailable,
	d1SearchFetcher,
	parseSearchD1Index,
	parseSearchPrimaryConfig,
	parseSearchPrimaryEngine
} from "../src/searchEngine";
import { testEnv } from "./honoTestApp";

const searchHost = "https://search.example/indexes/test/docs/search?api-version=2024-07-01";

function parseJsonc(text: string): any {
	let out = "";
	let i = 0;
	let inString = false;
	while (i < text.length) {
		const ch = text[i];
		if (inString) {
			out += ch;
			if (ch === "\\" && i + 1 < text.length) {
				out += text[i + 1];
				i += 2;
				continue;
			}
			if (ch === '"') inString = false;
			i += 1;
			continue;
		}
		if (ch === '"') {
			inString = true;
			out += ch;
			i += 1;
			continue;
		}
		if (ch === "/" && text[i + 1] === "/") {
			i += 2;
			while (i < text.length && text[i] !== "\n") i += 1;
			continue;
		}
		if (ch === "/" && text[i + 1] === "*") {
			i += 2;
			while (i + 1 < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
			i += 2;
			continue;
		}
		out += ch;
		i += 1;
	}
	return JSON.parse(out);
}

function app() {
	const hono = new Hono<{ Bindings: Env }>();
	hono.post("/search", (c) => search(c as unknown as ActionContext));
	return hono;
}

function envelope(ids: string[], engine?: "azure" | "d1", count?: number) {
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

describe("parseSearchPrimaryConfig", () => {
	it("defaults to Azure and the production D1 index", () => {
		expect(parseSearchPrimaryConfig({})).toEqual({
			engine: SearchPrimaryEngine.Azure,
			index: SearchD1Index.Production
		});
		expect(SearchPrimaryEngine.Azure).toBe("azure");
		expect(SearchPrimaryEngine.D1).toBe("d1");
		expect(SearchD1Index.Production).toBe("production");
		expect(SearchD1Index.Preview).toBe("preview");
	});

	it("accepts only the enum wire values; anything else is the default", () => {
		expect(parseSearchPrimaryEngine("d1")).toBe(SearchPrimaryEngine.D1);
		expect(parseSearchPrimaryEngine("azure")).toBe(SearchPrimaryEngine.Azure);
		expect(parseSearchPrimaryEngine("D1")).toBe(SearchPrimaryEngine.Azure);
		expect(parseSearchPrimaryEngine("")).toBe(SearchPrimaryEngine.Azure);
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

	it("treats timeouts, 429/5xx and unreadable bodies as unavailable, but not other 4xx", () => {
		expect(d1PrimaryIsUnavailable({ ok: false, error: "timeout", latencyMs: 10 })).toBe(true);
		expect(d1PrimaryIsUnavailable({ ok: false, error: "status_503", status: 503, latencyMs: 10 })).toBe(true);
		expect(d1PrimaryIsUnavailable({ ok: false, error: "status_429", status: 429, latencyMs: 10 })).toBe(true);
		expect(d1PrimaryIsUnavailable({ ok: false, error: "non_json_body", status: 200, latencyMs: 10 })).toBe(true);
		expect(d1PrimaryIsUnavailable({ ok: false, error: "status_400", status: 400, latencyMs: 10, body: { error: "Bad request" } })).toBe(false);
	});
});

describe("wrangler SP-4.1 switches", () => {
	const config = parseJsonc(readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8"));

	it("leaves production on Azure / production index", () => {
		expect(config.vars.searchPrimaryEngine).toBe(SearchPrimaryEngine.Azure);
		expect(config.vars.searchD1Index).toBe(SearchD1Index.Production);
		expect(config.env.local.vars.searchPrimaryEngine).toBe(SearchPrimaryEngine.Azure);
	});

	it("enables D1 as the served engine on api-preview, defaulting to the production index", () => {
		expect(config.env.preview.vars.searchPrimaryEngine).toBe(SearchPrimaryEngine.D1);
		expect(config.env.preview.vars.searchD1Index).toBe(SearchD1Index.Production);
		const services = config.env.preview.services;
		expect(services).toEqual(expect.arrayContaining([
			expect.objectContaining({ binding: "SEARCH", service: "search" }),
			expect.objectContaining({ binding: "SEARCH_PREVIEW", service: "search-preview" })
		]));
	});
});

describe("POST /search primary engine (SP-4.1)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("serves Azure and does not call D1 when the switch is off", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		const d1 = d1Fetcher(envelope(["d1-1"], "d1"));
		const resp = await app().request(
			"/search",
			{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ search: "x" }) },
			env({ SEARCH: d1 })
		);
		expect(resp.status).toBe(200);
		const body = await resp.json() as { "@search.engine": string; value: { id: string }[] };
		expect(body["@search.engine"]).toBe(SearchPrimaryEngine.Azure);
		expect(body.value[0].id).toBe("azure-1");
		expect(azure).toHaveBeenCalledOnce();
		expect(d1.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
	});

	it("serves the D1 body with @search.engine d1 and does not call Azure", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		const d1 = d1Fetcher(envelope(["d1-1"], "d1"));
		const resp = await app().request(
			"/search",
			{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ search: "x" }) },
			env({ searchPrimaryEngine: SearchPrimaryEngine.D1, SEARCH: d1 })
		);
		expect(resp.status).toBe(200);
		const body = await resp.json() as { "@search.engine": string; value: { id: string }[] };
		expect(body["@search.engine"]).toBe(SearchPrimaryEngine.D1);
		expect(body.value[0].id).toBe("d1-1");
		expect(azure).not.toHaveBeenCalled();
		expect(d1.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
	});

	it("uses SEARCH_PREVIEW when searchD1Index is preview", async () => {
		stubAzure(envelope(["azure-1"]));
		const production = d1Fetcher(envelope(["prod-1"], "d1"));
		const preview = d1Fetcher(envelope(["preview-1"], "d1"));
		const resp = await app().request(
			"/search",
			{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ search: "x" }) },
			env({
				searchPrimaryEngine: SearchPrimaryEngine.D1,
				searchD1Index: SearchD1Index.Preview,
				SEARCH: production,
				SEARCH_PREVIEW: preview
			})
		);
		expect((await resp.json() as { value: { id: string }[] }).value[0].id).toBe("preview-1");
		expect(preview.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
		expect(production.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
	});

	it("does not shadow D1 against itself when primary is D1, even if the sampler is on", async () => {
		stubAzure(envelope(["azure-1"]));
		const d1 = d1Fetcher(envelope(["d1-1"], "d1"));
		const resp = await app().request(
			"/search",
			{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ search: "x" }) },
			env({
				searchPrimaryEngine: SearchPrimaryEngine.D1,
				searchShadowEnabled: "true",
				searchShadowSampleRate: "1",
				SEARCH: d1
			})
		);
		expect(resp.status).toBe(200);
		expect(d1.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
	});

	it("falls back to Azure when D1 times out, and logs the fallback", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		const warnings: unknown[] = [];
		vi.spyOn(console, "warn").mockImplementation((row: unknown) => { warnings.push(row); });
		const hung = { fetch: vi.fn(() => new Promise<Response>(() => {})) } as unknown as Fetcher;
		const resp = await app().request(
			"/search",
			{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ search: "x" }) },
			env({
				searchPrimaryEngine: SearchPrimaryEngine.D1,
				searchShadowTimeoutMs: "50",
				SEARCH: hung
			})
		);
		expect(resp.status).toBe(200);
		const body = await resp.json() as { "@search.engine": string; value: { id: string }[] };
		expect(body["@search.engine"]).toBe(SearchPrimaryEngine.Azure);
		expect(body.value[0].id).toBe("azure-1");
		expect(azure).toHaveBeenCalledOnce();
		expect(warnings).toEqual(expect.arrayContaining([
			expect.objectContaining({ message: "search d1 primary fallback", error: "timeout" })
		]));
	});

	it("falls back to Azure when D1 returns 503", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "warn").mockImplementation(() => { });
		const d1 = d1Fetcher({ error: { message: "unavailable" } }, 503);
		const resp = await app().request(
			"/search",
			{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ search: "x" }) },
			env({ searchPrimaryEngine: SearchPrimaryEngine.D1, SEARCH: d1 })
		);
		const body = await resp.json() as { "@search.engine": string; value: { id: string }[] };
		expect(body["@search.engine"]).toBe(SearchPrimaryEngine.Azure);
		expect(body.value[0].id).toBe("azure-1");
		expect(azure).toHaveBeenCalledOnce();
	});

	it("falls back to Azure when the selected D1 binding is missing", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		vi.spyOn(console, "warn").mockImplementation(() => { });
		const resp = await app().request(
			"/search",
			{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ search: "x" }) },
			env({ searchPrimaryEngine: SearchPrimaryEngine.D1, searchD1Index: SearchD1Index.Preview })
		);
		const body = await resp.json() as { "@search.engine": string; value: { id: string }[] };
		expect(body.value[0].id).toBe("azure-1");
		expect(azure).toHaveBeenCalledOnce();
	});

	it("forwards a D1 400 and does not fall back to Azure", async () => {
		const azure = stubAzure(envelope(["azure-1"]));
		const d1Error = { error: { message: "filter is invalid" } };
		const d1 = d1Fetcher(d1Error, 400);
		const resp = await app().request(
			"/search",
			{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ search: "x", filter: "bad" }) },
			env({ searchPrimaryEngine: SearchPrimaryEngine.D1, SEARCH: d1 })
		);
		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual(d1Error);
		expect(azure).not.toHaveBeenCalled();
	});

	it("when primary is Azure, shadow uses the selected D1 index", async () => {
		stubAzure(envelope(["azure-1"]));
		const production = d1Fetcher(envelope(["prod-1"], "d1"));
		const preview = d1Fetcher(envelope(["preview-1"], "d1"));
		vi.spyOn(console, "info").mockImplementation(() => { });
		const { ctx, flush } = executionCtx();
		const resp = await app().request(
			"/search",
			{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ search: "x" }) },
			env({
				searchShadowEnabled: "true",
				searchShadowSampleRate: "1",
				searchD1Index: SearchD1Index.Preview,
				SEARCH: production,
				SEARCH_PREVIEW: preview
			}),
			ctx
		);
		expect(resp.status).toBe(200);
		expect((await resp.json() as { "@search.engine": string })["@search.engine"]).toBe(SearchPrimaryEngine.Azure);
		await flush();
		expect(preview.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
		expect(production.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
	});
});