import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));

import { Hono } from "hono";
import type { Env } from "../src/Env";
import type { ActionContext } from "../src/ActionContext";
import type { oDataSearchModel } from "../src/oDataSearchModel";
import { rewriteLegacyPodcastNameInSearchRequest } from "../src/rewriteLegacyPodcastNameInSearchRequest";
import { search } from "../src/search";
import { testEnv } from "./honoTestApp";

describe("rewriteLegacyPodcastNameInSearchRequest", () => {
	it("rewrites podcastName to seriesName in filter, facets, orderby, and select", () => {
		const data: oDataSearchModel = {
			search: "*",
			filter: "(podcastName eq 'Associated Press')",
			facets: ["podcastName,count:1000", "subjects,count:10"],
			orderby: "podcastName asc",
			select: "id,podcastName,title"
		};
		rewriteLegacyPodcastNameInSearchRequest(data);
		expect(data.filter).toBe("(seriesName eq 'Associated Press')");
		expect(data.facets).toEqual(["seriesName,count:1000", "subjects,count:10"]);
		expect(data.orderby).toBe("seriesName asc");
		expect(data.select).toBe("id,seriesName,title");
	});

	it("rewrites the logged NewsReport + podcastName shape", () => {
		const data: oDataSearchModel = {
			filter: "(contentKind eq 'NewsReport') and (podcastName eq 'Associated Press')"
		};
		rewriteLegacyPodcastNameInSearchRequest(data);
		expect(data.filter).toBe(
			"(contentKind eq 'NewsReport') and (seriesName eq 'Associated Press')"
		);
	});

	it("leaves seriesName filters unchanged", () => {
		const data: oDataSearchModel = {
			filter: "(seriesName eq 'Associated Press')",
			facets: ["seriesName,count:1000"]
		};
		rewriteLegacyPodcastNameInSearchRequest(data);
		expect(data.filter).toBe("(seriesName eq 'Associated Press')");
		expect(data.facets).toEqual(["seriesName,count:1000"]);
	});
});

const searchHost = "https://search.example/indexes/test/docs/search";

function app() {
	const hono = new Hono<{ Bindings: Env }>();
	hono.post("/search", (c) => search(c as unknown as ActionContext));
	return hono;
}

/** Collects `waitUntil` work (the D1 shadow query) so a test can await it. */
function executionCtx() {
	const tasks: Promise<unknown>[] = [];
	const ctx = {
		waitUntil(promise: Promise<unknown>) {
			tasks.push(promise);
		},
		passThroughOnException() {},
		props: {}
	} as unknown as ExecutionContext;
	return { ctx, flush: () => Promise.all(tasks) };
}

function jsonResponse(body: unknown) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
}

/** An empty search result that records each request body it was sent. */
function recordingSearch(bodies: string[]) {
	return vi.fn(async (_url: unknown, init?: RequestInit) => {
		bodies.push(String(init?.body));
		return jsonResponse({ value: [], "@odata.count": 0 });
	});
}

function envWith(overrides: Partial<Env> = {}): Env {
	return testEnv({
		apihost: searchHost,
		apikey: "test-search-key",
		Data: { get: async () => null } as unknown as R2Bucket,
		...overrides
	} as Partial<Env>);
}

/** What a stale client sends: Azure's pre-rename field in the filter and a facet. */
const staleClientBody = JSON.stringify({
	search: "*",
	filter: "(podcastName eq 'Associated Press')",
	facets: ["podcastName,count:1000"]
});

function postSearch(env: Env, ctx?: ExecutionContext) {
	return app().request(
		"/search",
		{ method: "POST", headers: { "content-type": "application/json" }, body: staleClientBody },
		env,
		ctx
	);
}

function expectRewritten(body: string) {
	const sent = JSON.parse(body) as { filter: string; facets: string[] };
	expect(sent.filter).toBe("(seriesName eq 'Associated Press')");
	expect(sent.facets).toEqual(["seriesName,count:1000"]);
}

describe("POST /search legacy podcastName alias", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("forwards seriesName to Azure when the client still sends podcastName", async () => {
		const azureBodies: string[] = [];
		vi.stubGlobal("fetch", recordingSearch(azureBodies));
		const resp = await postSearch(envWith());
		expect(resp.status).toBe(200);
		expect(azureBodies).toHaveLength(1);
		expectRewritten(azureBodies[0]);
	});

	it("sends seriesName to the D1 shadow query as well as to Azure", async () => {
		const azureBodies: string[] = [];
		const d1Bodies: string[] = [];
		vi.stubGlobal("fetch", recordingSearch(azureBodies));
		vi.spyOn(console, "info").mockImplementation(() => {});
		const { ctx, flush } = executionCtx();
		const resp = await postSearch(
			envWith({
				searchShadowEnabled: "true",
				searchShadowSampleRate: "1",
				SEARCH: { fetch: recordingSearch(d1Bodies) } as unknown as Fetcher
			}),
			ctx
		);
		expect(resp.status).toBe(200);
		await flush();
		expect(azureBodies).toHaveLength(1);
		expect(d1Bodies).toHaveLength(1);
		// Both engines get the same rewritten body (SP-4.3): nothing downstream sees podcastName.
		expect(d1Bodies[0]).toBe(azureBodies[0]);
		expectRewritten(d1Bodies[0]);
	});
});