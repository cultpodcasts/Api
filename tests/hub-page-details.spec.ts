import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/Env";
import type { ActionContext } from "../src/ActionContext";
import { getPageDetails } from "../src/getPageDetails";
import { catalogueHubPageDetailsTarget, hubPageDetailsFilters } from "../src/hubPageDetails";
import { testEnv } from "./honoTestApp";

const searchHost = "https://search.example/indexes/test/docs/search";
const episodeUuid = "00112233-4455-4677-8899-aabbccddeeff";

function app() {
	const hono = new Hono<{ Bindings: Env }>();
	hono.get("/pagedetails/:podcastName/:episodeId", (c) => getPageDetails(c as unknown as ActionContext));
	return hono;
}

function env(kvPuts: string[] = []): Env {
	return testEnv({
		apihost: searchHost,
		apikey: "test-search-key",
		shortner: {
			getWithMetadata: async () => ({ value: null, metadata: null }),
			put: async (key: string) => {
				kvPuts.push(key);
			}
		} as unknown as KVNamespace
	} as Partial<Env>);
}

type SearchBody = { filter: string; top?: number; count?: boolean; orderby?: string };

function stubSearch(respond: (body: SearchBody) => Response) {
	const bodies: SearchBody[] = [];
	const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body)) as SearchBody;
		bodies.push(body);
		return respond(body);
	});
	vi.stubGlobal("fetch", fetchMock);
	return { bodies, fetchMock };
}

function searchJson(value: Record<string, unknown>[], count = value.length): Response {
	return new Response(JSON.stringify({ "@odata.count": count, value }), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
}

const latestReport = {
	id: episodeUuid,
	title: "Evening bulletin",
	seriesName: "Desk News",
	contentKind: "NewsReport",
	release: "2026-10-01T00:00:00Z",
	youtubeId: "abc123def45"
};

describe("GET /pagedetails/news|tv/{name}", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns hub details for a news outlet from its newest report and count", async () => {
		const kvPuts: string[] = [];
		const { bodies } = stubSearch(() => searchJson([latestReport], 42));
		const resp = await app().request(`/pagedetails/news/${encodeURIComponent("Desk News")}`, {}, env(kvPuts));
		expect(resp.status).toBe(200);
		const details = (await resp.json()) as Record<string, string>;
		expect(details.title).toBe("Desk News");
		expect(details.description).toBe("Desk News has 42 reports found by CultPodcasts.com");
		expect(details.image).toContain("/og-image?");
		expect(new URL(details.image).searchParams.get("t")).toBe("Desk News");
		expect(details.imageAspect).toBe("wide");
		expect(bodies).toHaveLength(1);
		expect(bodies[0]).toMatchObject({
			filter: "(seriesName eq 'Desk News') and (contentKind eq 'NewsReport')",
			orderby: "release desc",
			top: 1,
			count: true
		});
		expect(kvPuts).toEqual([]);
	});

	it("uses TvShowEpisode and the singular noun for a TV show with one episode", async () => {
		const { bodies } = stubSearch(() => searchJson([{ id: episodeUuid, title: "Pilot", contentKind: "TvShowEpisode" }], 1));
		const resp = await app().request("/pagedetails/tv/Nightly", {}, env());
		expect(resp.status).toBe(200);
		const details = (await resp.json()) as Record<string, string | undefined>;
		expect(details).toEqual({ title: "Nightly", description: "Nightly has 1 episode found by CultPodcasts.com" });
		expect(bodies[0].filter).toBe("(seriesName eq 'Nightly') and (contentKind eq 'TvShowEpisode')");
	});

	it("falls back to podcastName when the seriesName query fails", async () => {
		const { bodies } = stubSearch((body) =>
			body.filter.startsWith("(seriesName") ? new Response("{}", { status: 400 }) : searchJson([latestReport], 3)
		);
		const resp = await app().request("/pagedetails/news/Desk%20News", {}, env());
		expect(resp.status).toBe(200);
		expect(bodies.map((b) => b.filter)).toEqual([
			"(seriesName eq 'Desk News') and (contentKind eq 'NewsReport')",
			"(podcastName eq 'Desk News') and (contentKind eq 'NewsReport')"
		]);
	});

	it("keeps 400 No item found for an empty hub and 400 for a search error", async () => {
		stubSearch(() => searchJson([], 0));
		const empty = await app().request("/pagedetails/news/Nobody", {}, env());
		expect(empty.status).toBe(400);
		expect(await empty.text()).toBe("No item found");

		stubSearch(() => new Response("down", { status: 503 }));
		const failed = await app().request("/pagedetails/tv/Nightly", {}, env());
		expect(failed.status).toBe(400);
		expect(await failed.text()).toBe("Search-api error");
	});

	it("escapes quotes in the name and accepts the website's pre-encoded apostrophe", async () => {
		const { bodies } = stubSearch(() => searchJson([latestReport], 2));
		const preEncoded = encodeURIComponent("Jon%27s Desk");
		const resp = await app().request(`/pagedetails/news/${preEncoded}`, {}, env());
		expect(resp.status).toBe(200);
		expect(bodies[0].filter).toBe("(seriesName eq 'Jon''s Desk') and (contentKind eq 'NewsReport')");
	});

	it("leaves a podcast called news with an episode id on the episode path", async () => {
		const { bodies } = stubSearch(() => searchJson([]));
		const resp = await app().request(`/pagedetails/news/${episodeUuid}`, {}, env());
		expect(resp.status).toBe(400);
		expect(bodies[0].filter).toBe(`(seriesName eq 'news') and (id eq '${episodeUuid}')`);
	});
});

describe("catalogueHubPageDetailsTarget", () => {
	it("only treats news/tv with a non-id name as a hub", () => {
		expect(catalogueHubPageDetailsTarget("news", "NBC News")).toEqual({ hub: "news", name: "NBC News" });
		expect(catalogueHubPageDetailsTarget("tv", " Nightly ")).toEqual({ hub: "tv", name: "Nightly" });
		expect(catalogueHubPageDetailsTarget("film", "Movie")).toBeNull();
		expect(catalogueHubPageDetailsTarget("Desk", "NBC News")).toBeNull();
		expect(catalogueHubPageDetailsTarget("news", episodeUuid)).toBeNull();
		expect(catalogueHubPageDetailsTarget("news", "ABEiM0RVRneImaq7zN3u_w")).toBeNull();
		expect(catalogueHubPageDetailsTarget("news", "  ")).toBeNull();
		expect(catalogueHubPageDetailsTarget("news", "%E0%A4%A")).toEqual({ hub: "news", name: "%E0%A4%A" });
	});

	it("builds kind filters with seriesName then podcastName", () => {
		expect(hubPageDetailsFilters("tv", "O'Neil")).toEqual([
			"(seriesName eq 'O''Neil') and (contentKind eq 'TvShowEpisode')",
			"(podcastName eq 'O''Neil') and (contentKind eq 'TvShowEpisode')"
		]);
	});
});
