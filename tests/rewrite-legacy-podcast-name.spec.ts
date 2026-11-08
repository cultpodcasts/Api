import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));

import { Hono } from "hono";
import type { Env } from "../src/Env";
import type { ActionContext } from "../src/ActionContext";
import { rewriteLegacyPodcastNameInSearchRequest } from "../src/rewriteLegacyPodcastNameInSearchRequest";
import { search } from "../src/search";
import { testEnv } from "./honoTestApp";

describe("rewriteLegacyPodcastNameInSearchRequest", () => {
	it("rewrites podcastName to seriesName in filter, facets, orderby, and select", () => {
		const data: Record<string, unknown> = {
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
		const data: Record<string, unknown> = {
			filter: "(contentKind eq 'NewsReport') and (podcastName eq 'Associated Press')"
		};
		rewriteLegacyPodcastNameInSearchRequest(data);
		expect(data.filter).toBe(
			"(contentKind eq 'NewsReport') and (seriesName eq 'Associated Press')"
		);
	});

	it("leaves seriesName filters unchanged", () => {
		const data: Record<string, unknown> = {
			filter: "(seriesName eq 'Associated Press')",
			facets: ["seriesName,count:1000"]
		};
		rewriteLegacyPodcastNameInSearchRequest(data);
		expect(data.filter).toBe("(seriesName eq 'Associated Press')");
		expect(data.facets).toEqual(["seriesName,count:1000"]);
	});
});

describe("POST /search legacy podcastName alias", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("forwards seriesName to Azure when the client still sends podcastName", async () => {
		const bodies: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: unknown, init?: RequestInit) => {
				bodies.push(String(init?.body));
				return new Response(JSON.stringify({ value: [], "@odata.count": 0 }), {
					status: 200,
					headers: { "content-type": "application/json" }
				});
			})
		);
		const hono = new Hono<{ Bindings: Env }>();
		hono.post("/search", (c) => search(c as unknown as ActionContext));
		const resp = await hono.request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					search: "*",
					filter: "(podcastName eq 'Associated Press')",
					facets: ["podcastName,count:1000"]
				})
			},
			testEnv({
				apihost: "https://search.example/indexes/test/docs/search",
				apikey: "test-search-key",
				Data: { get: async () => null } as unknown as R2Bucket
			} as Partial<Env>)
		);
		expect(resp.status).toBe(200);
		expect(bodies).toHaveLength(1);
		const sent = JSON.parse(bodies[0]) as { filter: string; facets: string[] };
		expect(sent.filter).toBe("(seriesName eq 'Associated Press')");
		expect(sent.facets).toEqual(["seriesName,count:1000"]);
	});
});
