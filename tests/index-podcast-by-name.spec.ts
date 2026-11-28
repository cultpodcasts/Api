import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import { indexPodcastBacklogByName, indexPodcastByName, previewPodcastBacklogByName } from "../src/indexPodcastByName";
import {
	IndexPodcastBacklogByNameRoute,
	IndexPodcastByNameRoute,
	PreviewPodcastBacklogByNameRoute
} from "../src/openapiRoutes";
import {
	catalogueIndexTimedOutSchema,
	indexPodcastBacklogPreviewResponseSchema,
	indexPodcastResponseSchema,
	podcastIndexBusySchema
} from "../src/openapiSchemas";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const name = "Synthetic Show & Co";
const azureBase = "https://functions.example/api/podcast/index/";
const okBody = {
	indexedEpisodes: [],
	indexStatus: "Performed",
	searchIndexerState: "Executed"
};
const busyBody = {
	reason: "indexingInProgress",
	message: "Another index of this parent is already running. Try again shortly."
};
const previewContractBody = { newEpisodeCount: 12, ignoredEpisodeCount: 3 };
const timedOutBody = {
	reason: "TimedOut",
	message: "Indexing ran out of time; anything it saved will reach search on the next pull-indexer run. Try again later."
};

function stubFetch(status: number, body: unknown) {
	const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("indexPodcastByName Azure proxy", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("posts to Azure /api/podcast/index/{name} without a search string so short lookback stays the default", async () => {
		const fetchMock = stubFetch(200, okBody);
		const app = appWithPermissions("/podcast/index/:name", "post", indexPodcastByName, ["curate"]);
		const resp = await app.request(
			`/podcast/index/${encodeURIComponent(name)}`,
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);
		expect(resp.status).toBe(200);
		const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(String(url)).toBe(`${azureBase}${encodeURIComponent(name)}`);
	});

	it("does not forward obsolete ?backlog=true onto the default Azure index path", async () => {
		const fetchMock = stubFetch(200, okBody);
		const app = appWithPermissions("/podcast/index/:name", "post", indexPodcastByName, ["curate"]);
		await app.request(
			`/podcast/index/${encodeURIComponent(name)}?backlog=true`,
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);
		const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(String(url)).toBe(`${azureBase}${encodeURIComponent(name)}`);
		expect(String(url)).not.toContain("backlog");
	});

	it("forwards 409 indexingInProgress and 504 TimedOut with bodies; maps other upstream statuses to 500", async () => {
		const app = appWithPermissions("/podcast/index/:name", "post", indexPodcastByName, ["curate"]);
		for (const [status, body] of [
			[409, busyBody],
			[504, timedOutBody]
		] as const) {
			stubFetch(status, body);
			const resp = await app.request(
				`/podcast/index/${encodeURIComponent(name)}`,
				{ method: "POST", headers: authJsonHeaders, body: "{}" },
				testEnv()
			);
			expect(resp.status).toBe(status);
			expect(await resp.json()).toEqual(body);
			vi.unstubAllGlobals();
		}
		stubFetch(502, { error: "Bad gateway" });
		const gateway = await app.request(
			`/podcast/index/${encodeURIComponent(name)}`,
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);
		expect(gateway.status).toBe(500);
		expect(await gateway.json()).toEqual({ error: "Error" });
	});
});

describe("indexPodcastBacklogByName Azure proxy", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("posts to Azure /api/podcast/index/{name}/backlog for an admin cold-start", async () => {
		const fetchMock = stubFetch(200, okBody);
		const app = appWithPermissions(
			"/podcast/index/:name/backlog",
			"post",
			indexPodcastBacklogByName,
			["admin"]
		);
		const resp = await app.request(
			`/podcast/index/${encodeURIComponent(name)}/backlog`,
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);
		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(okBody);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(String(url)).toBe(`${azureBase}${encodeURIComponent(name)}/backlog`);
		expect(init?.method).toBe("POST");
	});

	it("forwards 409 indexingInProgress and 504 TimedOut with bodies on the backlog path", async () => {
		const app = appWithPermissions(
			"/podcast/index/:name/backlog",
			"post",
			indexPodcastBacklogByName,
			["admin"]
		);
		for (const [status, body] of [
			[409, busyBody],
			[504, timedOutBody]
		] as const) {
			stubFetch(status, body);
			const resp = await app.request(
				`/podcast/index/${encodeURIComponent(name)}/backlog`,
				{ method: "POST", headers: authJsonHeaders, body: "{}" },
				testEnv()
			);
			expect(resp.status).toBe(status);
			expect(await resp.json()).toEqual(body);
			vi.unstubAllGlobals();
		}
	});
});

describe("indexPodcastBacklogByName admin gate (RPP #1433)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("rejects a curate-only caller with 403 and never calls Azure, because the backlog walk is admin only", async () => {
		const fetchMock = stubFetch(200, okBody);
		const app = appWithPermissions(
			"/podcast/index/:name/backlog",
			"post",
			indexPodcastBacklogByName,
			["curate"]
		);
		const resp = await app.request(
			`/podcast/index/${encodeURIComponent(name)}/backlog`,
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);
		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("keeps the default hub index open to a curate-only caller", async () => {
		stubFetch(200, okBody);
		const app = appWithPermissions("/podcast/index/:name", "post", indexPodcastByName, ["curate"]);
		const resp = await app.request(
			`/podcast/index/${encodeURIComponent(name)}`,
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);
		expect(resp.status).toBe(200);
	});
});

describe("previewPodcastBacklogByName Azure proxy (RPP #1433)", () => {
	const previewBody = { newEpisodeCount: 12, ignoredEpisodeCount: 3 };
	const path = `/podcast/index/${encodeURIComponent(name)}/backlog/preview`;

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function previewApp(permissions: string[]) {
		return appWithPermissions(
			"/podcast/index/:name/backlog/preview",
			"get",
			previewPodcastBacklogByName,
			permissions
		);
	}

	it("GETs Azure /api/podcast/index/{name}/backlog/preview for an admin and returns the counts uncached", async () => {
		const fetchMock = stubFetch(200, previewBody);
		const resp = await previewApp(["admin"]).request(
			path,
			{ method: "GET", headers: authJsonHeaders },
			testEnv()
		);
		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(previewBody);
		expect(resp.headers.get("Cache-Control")).toBe("no-store");
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(String(url)).toBe(`${azureBase}${encodeURIComponent(name)}/backlog/preview`);
		expect(init?.method).toBe("GET");
	});

	it("rejects a curate-only caller with 403 and never calls Azure", async () => {
		const fetchMock = stubFetch(200, previewBody);
		const resp = await previewApp(["curate"]).request(
			path,
			{ method: "GET", headers: authJsonHeaders },
			testEnv()
		);
		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("forwards 404, 400 and 504 TimedOut bodies; maps other upstream statuses to 500", async () => {
		const app = previewApp(["admin"]);
		for (const [status, body] of [
			[404, { indexStatus: "NotFound" }],
			[400, { indexStatus: "NotPerformed" }],
			[504, timedOutBody]
		] as const) {
			stubFetch(status, body);
			const resp = await app.request(path, { method: "GET", headers: authJsonHeaders }, testEnv());
			expect(resp.status).toBe(status);
			expect(await resp.json()).toEqual(body);
			vi.unstubAllGlobals();
		}
		stubFetch(502, { error: "Bad gateway" });
		const gateway = await app.request(path, { method: "GET", headers: authJsonHeaders }, testEnv());
		expect(gateway.status).toBe(500);
	});
});
describe("indexPodcastByName OpenAPI contract", () => {
	it("documents short lookback without a backlog query, plus 409 busy and 504 TimedOut", () => {
		expect(podcastIndexBusySchema.parse(busyBody)).toEqual(busyBody);
		expect(catalogueIndexTimedOutSchema.parse(timedOutBody)).toEqual(timedOutBody);
		expect(indexPodcastResponseSchema.parse(okBody)).toEqual(okBody);

		const schema = IndexPodcastByNameRoute.openApiSchema;
		expect(schema.description).toMatch(/short hub Index lookback/i);
		expect(schema.description).toMatch(/\/backlog/i);
		const request = schema.request as { query?: unknown } | undefined;
		expect(request?.query).toBeUndefined();
		expect(schema.responses?.[409]).toBeDefined();
		expect(schema.responses?.[504]).toBeDefined();
		const busy = schema.responses?.[409] as { content?: { "application/json"?: { schema?: unknown } } };
		expect(busy?.content?.["application/json"]?.schema).toBe(podcastIndexBusySchema);
		const timedOut = schema.responses?.[504] as { content?: { "application/json"?: { schema?: unknown } } };
		expect(timedOut?.content?.["application/json"]?.schema).toBe(catalogueIndexTimedOutSchema);
	});

	it("documents the dedicated backlog path with the same 409 and 504 outcomes", () => {
		const schema = IndexPodcastBacklogByNameRoute.openApiSchema;
		expect(schema.summary).toMatch(/backlog/i);
		expect(schema.description).toMatch(/\/api\/podcast\/index\/\{name\}\/backlog/);
		const request = schema.request as { query?: unknown } | undefined;
		expect(request?.query).toBeUndefined();
		expect(schema.responses?.[409]).toBeDefined();
		expect(schema.responses?.[504]).toBeDefined();
		const busy = schema.responses?.[409] as { content?: { "application/json"?: { schema?: unknown } } };
		expect(busy?.content?.["application/json"]?.schema).toBe(podcastIndexBusySchema);
		const timedOut = schema.responses?.[504] as { content?: { "application/json"?: { schema?: unknown } } };
		expect(timedOut?.content?.["application/json"]?.schema).toBe(catalogueIndexTimedOutSchema);
	});

	it("documents the backlog index as admin only", () => {
		expect(IndexPodcastBacklogByNameRoute.openApiSchema.description).toMatch(/with `admin`.*Admin only/s);
	});

	it("documents the backlog preview as an admin-only query with counts, 404, 400 and 504 TimedOut", () => {
		const schema = PreviewPodcastBacklogByNameRoute.openApiSchema;
		expect(schema.description).toMatch(/with `admin`.*Admin only/s);
		expect(schema.description).toMatch(/\/api\/podcast\/index\/\{name\}\/backlog\/preview/);
		expect(indexPodcastBacklogPreviewResponseSchema.parse(previewContractBody)).toEqual(previewContractBody);
		const ok = schema.responses?.[200] as { content?: { "application/json"?: { schema?: unknown } } };
		expect(ok?.content?.["application/json"]?.schema).toBe(indexPodcastBacklogPreviewResponseSchema);
		expect(schema.responses?.[400]).toBeDefined();
		expect(schema.responses?.[404]).toBeDefined();
		const timedOut = schema.responses?.[504] as { content?: { "application/json"?: { schema?: unknown } } };
		expect(timedOut?.content?.["application/json"]?.schema).toBe(catalogueIndexTimedOutSchema);
	});
});