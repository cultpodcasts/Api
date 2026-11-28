import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({
	ImageResponse: class ImageResponse {}
}));

import { createFilm } from "../src/createFilm";
import { CreateFilmRoute } from "../src/openapiRoutes";
import { filmCreateRequestSchema, filmCreateResponseSchema } from "../src/openapiSchemas";
import { registerOpenApiRoutes } from "../src/registerOpenApiRoutes";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";

const filmId = "925e2a11-668f-4dfa-a78d-57dd4de0051f";
const route = "/film";

function appWithCurate() {
	return appWithPermissions(route, "post", createFilm, ["curate"]);
}

function post(app: ReturnType<typeof appWithCurate>, body?: string) {
	return app.request(route, { method: "POST", headers: authJsonHeaders, body }, testEnv());
}

describe("create film", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("POSTs Azure /api/film with the identity body unchanged and returns the 202 acknowledgement", async () => {
		const outcome = { filmId, name: "Synthetic Film", failureIndexing: false };
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(outcome), { status: 202 }));
		vi.stubGlobal("fetch", fetchMock);
		const request = {
			tmdbId: 4242,
			imdbId: "tt0123456",
			title: "Synthetic Film",
			publisher: "Synthetic Studio"
		};

		const resp = await post(appWithCurate(), JSON.stringify(request));

		expect(resp.status).toBe(202);
		expect(await resp.json()).toEqual(outcome);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(new URL(String(url)).pathname).toBe("/api/film");
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual(request);
	});

	it("sends {} to Azure when the request has no body, leaving validation to Azure", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "Provide ids or a title" }), { status: 400 }));
		vi.stubGlobal("fetch", fetchMock);

		const resp = await post(appWithCurate());

		expect(resp.status).toBe(400);
		expect(await resp.json()).toEqual({ error: "Provide ids or a title" });
		const [, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({});
	});

	it("forwards the 200 identityDecision, then the select re-POST body and its 202", async () => {
		const decision = {
			identityDecision: {
				target: "Film",
				query: "Synthetic Film",
				candidates: [{ key: "tmdb:42", title: "Synthetic Film", year: 2020, kind: "Film", source: "tmdb" }]
			}
		};
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(decision), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const probe = await post(appWithCurate(), JSON.stringify({ title: "Synthetic Film" }));
		expect(probe.status).toBe(200);
		expect(await probe.json()).toEqual(decision);

		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ filmId, name: "Synthetic Film", failureIndexing: false }), { status: 202 }));
		const select = await post(
			appWithCurate(),
			JSON.stringify({ title: "Synthetic Film", identityDecision: "select", selectedIdentityKey: "tmdb:42" })
		);

		expect(select.status).toBe(202);
		const [, init] = fetchMock.mock.calls[1] as [URL | string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({
			title: "Synthetic Film",
			identityDecision: "select",
			selectedIdentityKey: "tmdb:42"
		});
	});

	it("forwards the 200 cancelled outcome", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ cancelled: true }), { status: 200 })));

		const resp = await post(appWithCurate(), JSON.stringify({ title: "Synthetic Film", identityDecision: "cancel" }));

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ cancelled: true });
	});

	it("forwards the 409 with the existing film's filmId", async () => {
		const conflict = { filmId, name: "Synthetic Film", error: "A film with this TMDB id already exists" };
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(conflict), { status: 409 })));

		const resp = await post(appWithCurate(), JSON.stringify({ tmdbId: 4242 }));

		expect(resp.status).toBe(409);
		expect(await resp.json()).toEqual(conflict);
	});

	it("forwards the 500 failureIndexing body with the kept film's filmId", async () => {
		const failed = { filmId, name: "Synthetic Film", failureIndexing: true };
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(failed), { status: 500 })));

		const resp = await post(appWithCurate(), JSON.stringify({ tmdbId: 4242 }));

		expect(resp.status).toBe(500);
		expect(await resp.json()).toEqual(failed);
	});

	it.each([
		[400, { error: "tmdbId and imdbId identify different films" }],
		[404, { error: "No film found" }]
	] as const)("passes Azure %s through", async (status, body) => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

		const resp = await post(appWithCurate(), JSON.stringify({ tmdbId: 4242 }));

		expect(resp.status).toBe(status);
		expect(await resp.json()).toEqual(body);
	});

	it("returns 400 for a malformed body without calling Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const resp = await post(appWithCurate(), "{not json");

		expect(resp.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 403, not 400, for a malformed body without curate", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const resp = await post(appWithPermissions(route, "post", createFilm, ["submit"]), "{not json");

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 403 without curate and does not call Azure", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const resp = await post(appWithPermissions(route, "post", createFilm, ["submit"]), JSON.stringify({ tmdbId: 4242 }));

		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns the Worker 500 when Azure answers an unforwarded status", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));

		const resp = await post(appWithCurate(), JSON.stringify({ tmdbId: 4242 }));

		expect(resp.status).toBe(500);
		expect(await resp.json()).toEqual({ error: "Error" });
	});
});

describe("create film schemas and route registration", () => {
	it("accepts the RPP request fields and rejects a non-integer tmdbId or unknown decision", () => {
		expect(filmCreateRequestSchema.parse({
			tmdbId: 4242,
			imdbId: "tt0123456",
			title: "Synthetic Film",
			publisher: "Synthetic Studio",
			identityDecision: "select",
			selectedIdentityKey: "tmdb:42"
		}).tmdbId).toBe(4242);
		expect(filmCreateRequestSchema.parse({}).tmdbId).toBeUndefined();
		expect(() => filmCreateRequestSchema.parse({ tmdbId: "4242" })).toThrow();
		expect(() => filmCreateRequestSchema.parse({ tmdbId: 1.5 })).toThrow();
		expect(() => filmCreateRequestSchema.parse({ identityDecision: "maybe" })).toThrow();
	});

	it("parses each RPP response shape: 202, 200 identityDecision / cancelled, 409, 500 failureIndexing", () => {
		expect(filmCreateResponseSchema.parse({ filmId, name: "Synthetic Film", failureIndexing: false }).filmId).toBe(filmId);
		const decision = filmCreateResponseSchema.parse({
			identityDecision: { target: "Film", query: "Synthetic", candidates: [{ key: "tmdb:42", title: "Synthetic", kind: "Film", source: "tmdb" }] }
		});
		expect(decision.identityDecision?.candidates).toHaveLength(1);
		expect(filmCreateResponseSchema.parse({ cancelled: true }).cancelled).toBe(true);
		expect(filmCreateResponseSchema.parse({ filmId, name: "Synthetic Film", error: "exists" }).error).toBe("exists");
		expect(filmCreateResponseSchema.parse({ filmId, name: "Synthetic Film", failureIndexing: true }).failureIndexing).toBe(true);
		expect(() => filmCreateResponseSchema.parse({ filmId: "not-a-guid" })).toThrow();
	});

	it("registers openapi.post /film with documented schemas for every outcome", () => {
		const registered = registerOpenApiRoutes({
			get: () => undefined,
			post: () => undefined,
			put: () => undefined,
			patch: () => undefined,
			delete: () => undefined
		});
		expect(
			registered.some((r) => r.method === "post" && r.path === "/film" && r.route === CreateFilmRoute)
		).toBe(true);

		type JsonContent = { content?: { "application/json"?: { schema?: unknown } } };
		const request = CreateFilmRoute.openApiSchema.request as { body?: JsonContent } | undefined;
		const responses = CreateFilmRoute.openApiSchema.responses ?? {};
		const schemaOf = (status: number) => (responses[status] as JsonContent | undefined)?.content?.["application/json"]?.schema;

		expect(request?.body?.content?.["application/json"]?.schema).toBe(filmCreateRequestSchema);
		for (const status of [200, 202, 409]) {
			expect(schemaOf(status), `status ${status}`).toBe(filmCreateResponseSchema);
		}
		for (const status of [400, 404, 500]) {
			expect(responses[status], `status ${status}`).toBeDefined();
		}
	});
});
