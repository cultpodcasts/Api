import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));

import type { Env } from "../src/Env";
import type { ActionContext } from "../src/ActionContext";
import {
	parseUpstreamSearchErrorBody,
	search,
	upstreamSearchErrorStatus
} from "../src/search";
import { testEnv } from "./honoTestApp";

const searchHost = "https://search.example/indexes/test/docs/search";

function app() {
	const hono = new Hono<{ Bindings: Env }>();
	hono.post("/search", (c) => search(c as unknown as ActionContext));
	return hono;
}

function env(): Env {
	return testEnv({
		apihost: searchHost,
		apikey: "test-search-key",
		Data: { get: async () => null } as unknown as R2Bucket
	} as Partial<Env>);
}

function stubUpstream(status: number, body: string, contentType = "application/json") {
	const fetchMock = vi.fn(async () =>
		new Response(body, {
			status,
			headers: { "content-type": contentType }
		})
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("upstreamSearchErrorStatus", () => {
	it("passes 4xx and 5xx through including 429", () => {
		expect(upstreamSearchErrorStatus(400)).toBe(400);
		expect(upstreamSearchErrorStatus(403)).toBe(403);
		expect(upstreamSearchErrorStatus(429)).toBe(429);
		expect(upstreamSearchErrorStatus(503)).toBe(503);
	});

	it("maps unexpected non-error statuses to 502", () => {
		expect(upstreamSearchErrorStatus(302)).toBe(502);
		expect(upstreamSearchErrorStatus(0)).toBe(502);
	});
});

describe("parseUpstreamSearchErrorBody", () => {
	it("parses Azure JSON error envelopes", async () => {
		const azure = {
			error: {
				code: "",
				message: "Could not find a property named 'podcastName' on type 'search.document'."
			}
		};
		const body = await parseUpstreamSearchErrorBody(
			new Response(JSON.stringify(azure), { status: 400 })
		);
		expect(body).toEqual(azure);
	});

	it("wraps non-JSON upstream text", async () => {
		const body = await parseUpstreamSearchErrorBody(new Response("throttle", { status: 429 }));
		expect(body).toEqual({ error: "throttle" });
	});
});

describe("POST /search upstream errors", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("forwards Azure 400 JSON including the missing field name", async () => {
		const azureError = {
			error: {
				code: "",
				message: "Could not find a property named 'podcastName' on type 'search.document'."
			}
		};
		stubUpstream(400, JSON.stringify(azureError));
		const resp = await app().request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ search: "*", filter: "podcastName eq 'x'" })
			},
			env()
		);
		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual(azureError);
	});

	it("does not collapse upstream 429 to 400", async () => {
		stubUpstream(429, JSON.stringify({ error: { message: "Too many requests" } }));
		const resp = await app().request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ search: "*" })
			},
			env()
		);
		expect(resp.status).toBe(429);
		expect(await resp.json()).toEqual({ error: { message: "Too many requests" } });
	});

	it("does not collapse upstream 503 to 400", async () => {
		stubUpstream(503, JSON.stringify({ error: { message: "Service unavailable" } }));
		const resp = await app().request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ search: "*" })
			},
			env()
		);
		expect(resp.status).toBe(503);
		expect(await resp.json()).toEqual({ error: { message: "Service unavailable" } });
	});

	it("still returns 200 search results on success", async () => {
		const ok = { value: [{ id: "1" }], "@odata.count": 1 };
		stubUpstream(200, JSON.stringify(ok));
		const resp = await app().request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ search: "*" })
			},
			env()
		);
		expect(resp.status).toBe(200);
		const body = (await resp.json()) as Record<string, unknown>;
		expect(body["@odata.context"]).toBeNull();
		expect(body.value).toEqual([{ id: "1" }]);
	});
});
