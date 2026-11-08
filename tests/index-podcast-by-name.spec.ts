import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import { indexPodcastByName } from "../src/indexPodcastByName";
import { IndexPodcastByNameRoute } from "../src/openapiRoutes";
import {
	catalogueIndexTimedOutSchema,
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

	it("forwards ?backlog=true on the Azure URL so api-infra receives curator cold-start mode", async () => {
		const fetchMock = stubFetch(200, okBody);
		const app = appWithPermissions("/podcast/index/:name", "post", indexPodcastByName, ["curate"]);
		const resp = await app.request(
			`/podcast/index/${encodeURIComponent(name)}?backlog=true`,
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);
		expect(resp.status).toBe(200);
		const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(String(url)).toBe(`${azureBase}${encodeURIComponent(name)}?backlog=true`);
	});

	it("omits search when the client sends no query so default hub Index lookback is unchanged", async () => {
		const fetchMock = stubFetch(200, okBody);
		const app = appWithPermissions("/podcast/index/:name", "post", indexPodcastByName, ["curate"]);
		await app.request(
			`/podcast/index/${encodeURIComponent(name)}`,
			{ method: "POST", headers: authJsonHeaders, body: "{}" },
			testEnv()
		);
		const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(String(url)).toBe(`${azureBase}${encodeURIComponent(name)}`);
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

describe("indexPodcastByName OpenAPI contract", () => {
	it("documents backlog query, 409 busy, and 504 TimedOut", () => {
		expect(podcastIndexBusySchema.parse(busyBody)).toEqual(busyBody);
		expect(catalogueIndexTimedOutSchema.parse(timedOutBody)).toEqual(timedOutBody);
		expect(indexPodcastResponseSchema.parse(okBody)).toEqual(okBody);

		const schema = IndexPodcastByNameRoute.openApiSchema;
		expect(schema.description).toMatch(/backlog/i);
		const request = schema.request as { query?: unknown } | undefined;
		expect(request?.query).toBeDefined();
		expect(schema.responses?.[409]).toBeDefined();
		expect(schema.responses?.[504]).toBeDefined();
		const busy = schema.responses?.[409] as { content?: { "application/json"?: { schema?: unknown } } };
		expect(busy?.content?.["application/json"]?.schema).toBe(podcastIndexBusySchema);
		const timedOut = schema.responses?.[504] as { content?: { "application/json"?: { schema?: unknown } } };
		expect(timedOut?.content?.["application/json"]?.schema).toBe(catalogueIndexTimedOutSchema);
	});
});
