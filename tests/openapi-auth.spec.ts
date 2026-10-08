import { fromHono } from "chanfana";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({
	ImageResponse: class ImageResponse {}
}));
import {
	AddBookmarkRoute,
	CreatePersonRoute,
	DeletePodcastEpisodeRoute,
	GetDiscoveryScheduleRoute,
	GetLanguagesRoute,
	GetPeopleRoute,
	HomepageRoute,
	PublicGetEpisodeRoute
} from "../src/openapiRoutes";
import { registerBearerAuthScheme } from "../src/openapiRouteFactory";
import { SubmitLookupRoute, SubmitRoute } from "../src/openapiSubmitPodcastRoutes";

function operation(doc: { paths?: Record<string, Record<string, unknown>> }, path: string, method: string) {
	return doc.paths?.[path]?.[method] as {
		security?: unknown;
		description?: string;
		responses?: Record<string, { description?: string; content?: Record<string, unknown> }>;
	};
}

describe("OpenAPI auth and response contracts", () => {
	const app = new Hono();
	const api = fromHono(app, {
		docs_url: null,
		schema: { info: { title: "Cult Podcasts API", version: "0" } }
	});
	registerBearerAuthScheme(
		(api as unknown as { registry: Parameters<typeof registerBearerAuthScheme>[0] }).registry
	);
	api.get("/people", GetPeopleRoute);
	api.get("/homepage", HomepageRoute);
	api.get("/discovery-schedule", GetDiscoveryScheduleRoute);
	api.get("/languages", GetLanguagesRoute);
	api.get("/public/episode/:id", PublicGetEpisodeRoute);
	api.put("/bookmark/:episodeId", AddBookmarkRoute);
	api.delete("/episode/:podcastId/:episodeId", DeletePodcastEpisodeRoute);
	api.post("/person", CreatePersonRoute);
	api.post("/submit", SubmitRoute);
	api.get("/submit/lookup", SubmitLookupRoute);
	const doc = (api as unknown as { schema: {
		components?: { securitySchemes?: Record<string, { type?: string; scheme?: string }> };
		paths?: Record<string, Record<string, unknown>>;
	} }).schema;

	it("publishes a bearer scheme and does not treat ID-token roles as the check", () => {
		const bearer = doc.components?.securitySchemes?.bearerAuth;
		expect(bearer?.type).toBe("http");
		expect(bearer?.scheme).toBe("bearer");
		expect(JSON.stringify(bearer)).toMatch(/permissions/);
		expect(JSON.stringify(bearer)).toMatch(/scope/);
		expect(JSON.stringify(bearer)).toMatch(/roles are not checked/);
	});

	it("marks GET /people as curate on the permissions claim, with a JSON list and a bodyless 404", () => {
		const people = operation(doc, "/people", "get");
		expect(people.security).toEqual([{ bearerAuth: [] }]);
		expect(people.description).toMatch(/`curate`/);
		expect(people.description).toMatch(/permissions` array/);
		expect(people.description).toMatch(/scope` value alone is not accepted/);
		expect(people.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
		expect(people.responses?.["401"]?.content?.["application/json"]).toBeTruthy();
		expect(people.responses?.["403"]?.description).toMatch(/without `curate`/);
		expect(people.responses?.["404"]?.description).toMatch(/missing/);
		expect(people.responses?.["404"]).not.toHaveProperty("content");
	});

	it("types discovery schedule instants as date-time and leaves the slot label a string", () => {
		const schedule = operation(doc, "/discovery-schedule", "get");
		const schema = JSON.stringify(schedule.responses?.["200"]?.content?.["application/json"]);
		expect(schema).toMatch(/"slotStartUtc"[\s\S]*?"format":"date-time"/);
		expect(schema).toMatch(/"slotStartUk"[\s\S]*?"format":"date-time"/);
		expect(schema).not.toMatch(/"slotId"[\s\S]{0,80}"format":"date-time"/);
		expect(schema).not.toMatch(/"runTimes"[\s\S]{0,120}"format":"date-time"/);
	});

	it("leaves the homepage public and JSON", () => {
		const homepage = operation(doc, "/homepage", "get");
		expect(homepage.security).toEqual([]);
		expect(homepage.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
		expect(homepage.responses?.["404"]).not.toHaveProperty("content");
	});

	it("documents bookmark save as any token, with 403 and JSON for a missing token", () => {
		const bookmarks = operation(doc, "/bookmark/{episodeId}", "put");
		expect(bookmarks.security).toEqual([{ bearerAuth: [] }]);
		expect(bookmarks.description).toMatch(/Any valid token/);
		expect(bookmarks.description).toMatch(/403/);
		expect(bookmarks.responses?.["401"]).toBeUndefined();
		expect(bookmarks.responses?.["403"]?.content?.["application/json"]).toBeTruthy();
		expect(bookmarks.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
	});

	it("names admin, curate-or-admin, and any-token episode read", () => {
		const remove = operation(doc, "/episode/{podcastId}/{episodeId}", "delete");
		expect(remove.responses?.["403"]?.description).toMatch(/`admin`/);
		const languages = operation(doc, "/languages", "get");
		expect(languages.description).toMatch(/`curate` or `admin`/);
		expect(languages.responses?.["404"]).not.toHaveProperty("content");
		const episode = operation(doc, "/public/episode/{id}", "get");
		expect(episode.security).toEqual([{ bearerAuth: [] }]);
		expect(episode.description).toMatch(/Any valid token/);
		expect(episode.responses?.["403"]).toBeUndefined();
		expect(episode.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
	});

	it("keeps person create as an empty 202 and documents optional submit auth", () => {
		const create = operation(doc, "/person", "post");
		expect(create.responses?.["202"]).toEqual({ description: "Person created (empty body)" });
		expect(create.responses?.["202"]).not.toHaveProperty("content");
		expect(create.responses?.["409"]?.content?.["application/json"]).toBeTruthy();
		const submit = operation(doc, "/submit", "post");
		expect(submit.security).toEqual([{}, { bearerAuth: [] }]);
		expect(submit.description).toMatch(/Authentication is optional/);
		expect(submit.responses?.["200"]?.content?.["application/json"]).toBeTruthy();
		const lookup = operation(doc, "/submit/lookup", "get");
		expect(lookup.security).toEqual([{ bearerAuth: [] }]);
		expect(lookup.responses?.["403"]?.description).toMatch(/without.*`submit` or `curate`/);
	});
});
