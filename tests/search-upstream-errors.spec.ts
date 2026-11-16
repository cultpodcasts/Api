import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));

import type { Env } from "../src/Env";
import type { ActionContext } from "../src/ActionContext";
import {
	parseUpstreamSearchErrorBody,
	search,
	UPSTREAM_ERROR_LOG_LIMIT,
	upstreamSearchErrorStatus
} from "../src/search";
import { testEnv } from "./honoTestApp";
import { AllowedOrigins } from "../src/AllowedOrigins";

const searchHost = "https://search.example/indexes/test/docs/search";

/** The website reads cross-origin: every error must carry CORS and JSON headers, and only a forwarded 429/503 may carry Retry-After. */
function expectReadableErrorHeaders(resp: Response) {
	expect(resp.headers.get("access-control-allow-origin")).toBe(AllowedOrigins[0]);
	expect(resp.headers.get("content-type")).toMatch(/^application\/json/);
	expect(resp.headers.get("retry-after")).toBeNull();
}

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

	it("replaces non-JSON upstream text with a generic body and hands the raw text to the log", async () => {
		const unparsed: string[] = [];
		const body = await parseUpstreamSearchErrorBody(
			new Response("<html>gateway secret detail</html>", { status: 502 }),
			(raw) => unparsed.push(raw)
		);
		expect(body).toEqual({ error: "Upstream search error" });
		expect(unparsed).toEqual(["<html>gateway secret detail</html>"]);
	});

	it("cuts the logged raw text to the limit", async () => {
		const unparsed: string[] = [];
		await parseUpstreamSearchErrorBody(
			new Response("x".repeat(UPSTREAM_ERROR_LOG_LIMIT + 50), { status: 503 }),
			(raw) => unparsed.push(raw)
		);
		expect(unparsed[0]).toHaveLength(UPSTREAM_ERROR_LOG_LIMIT);
	});

	it("treats a JSON primitive error body as not an envelope", async () => {
		const body = await parseUpstreamSearchErrorBody(new Response("42", { status: 500 }));
		expect(body).toEqual({ error: "Upstream search error" });
	});

	it("falls back when upstream body is empty", async () => {
		const body = await parseUpstreamSearchErrorBody(new Response("", { status: 503 }));
		expect(body).toEqual({ error: "Upstream search error" });
	});
});

describe("POST /search upstream errors", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("forwards Azure 400 JSON including the missing field name", async () => {
		// Use a field the Worker does not alias (podcastName → seriesName), so the
		// stubbed upstream 400 still matches what Azure would see after rewrite.
		const azureError = {
			error: {
				code: "",
				message: "Could not find a property named 'notAField' on type 'search.document'."
			}
		};
		stubUpstream(400, JSON.stringify(azureError));
		const resp = await app().request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ search: "*", filter: "notAField eq 'x'" })
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

	it("maps unexpected upstream 302 to 502", async () => {
		stubUpstream(302, "");
		const resp = await app().request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ search: "*" })
			},
			env()
		);
		expect(resp.status).toBe(502);
		expect(await resp.json()).toEqual({ error: "Upstream search error" });
	});

	it("forwards Retry-After on a retryable upstream 429", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response(JSON.stringify({ error: { message: "Too many requests" } }), {
					status: 429,
					headers: { "content-type": "application/json", "retry-after": "7" }
				})
			)
		);
		const resp = await post({ search: "*" });
		expect(resp.status).toBe(429);
		expect(resp.headers.get("retry-after")).toBe("7");
	});

	it("does not invent Retry-After when upstream sends none", async () => {
		stubUpstream(503, JSON.stringify({ error: { message: "Service unavailable" } }));
		const resp = await post({ search: "*" });
		expect(resp.status).toBe(503);
		expect(resp.headers.get("retry-after")).toBeNull();
	});

	it("returns 502, not 400, when the upstream cannot be reached", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("Network connection lost.");
			})
		);
		const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const resp = await post({ search: "*" });
		expect(resp.status).toBe(502);
		expect(await resp.json()).toEqual({
			error: { code: "UpstreamSearchError", message: "Upstream search unavailable" }
		});
		expect(errorLog).toHaveBeenCalledTimes(1);
		expectReadableErrorHeaders(resp);
	});

	it("returns 502, not 400, when upstream 200 has an unreadable body", async () => {
		stubUpstream(200, "<html>gateway page</html>", "text/html");
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const resp = await post({ search: "*" });
		expect(resp.status).toBe(502);
		expect(await resp.json()).toMatchObject({ error: { code: "UpstreamSearchError" } });
		expectReadableErrorHeaders(resp);
	});

	it.each([
		["null", "null"],
		["an array", "[1,2]"],
		["a number", "7"]
	])("returns 502, not a bare 500, when upstream 200 body is %s", async (_label, raw) => {
		stubUpstream(200, raw);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const resp = await post({ search: "*" });
		expect(resp.status).toBe(502);
		expect(await resp.json()).toMatchObject({ error: { code: "UpstreamSearchError" } });
		expectReadableErrorHeaders(resp);
	});

	it("never forwards a non-JSON upstream error page to the browser, but logs it", async () => {
		stubUpstream(503, "<html>internal gateway detail</html>", "text/html");
		const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const resp = await post({ search: "*" });
		expect(resp.status).toBe(503);
		expect(await resp.json()).toEqual({ error: "Upstream search error" });
		expect(JSON.stringify(errorLog.mock.calls)).toContain("internal gateway detail");
	});

	it("sends CORS headers on the legacy 400", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const resp = await app().request(
			"/search",
			{ method: "POST", headers: { "content-type": "application/json" }, body: "{not json" },
			env()
		);
		expect(resp.status).toBe(400);
		expectReadableErrorHeaders(resp);
	});

	it("still returns 400 for an invalid JSON request body without calling upstream", async () => {
		const fetchMock = stubUpstream(200, JSON.stringify({ value: [] }));
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const resp = await app().request(
			"/search",
			{ method: "POST", headers: { "content-type": "application/json" }, body: "{not json" },
			env()
		);
		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual({ error: "Bad request" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("still returns 400 for a JSON null request body without calling upstream", async () => {
		const fetchMock = stubUpstream(200, JSON.stringify({ value: [] }));
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const resp = await app().request(
			"/search",
			{ method: "POST", headers: { "content-type": "application/json" }, body: "null" },
			env()
		);
		expect(resp.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

function post(body: unknown) {
	return app().request(
		"/search",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body)
		},
		env()
	);
}
