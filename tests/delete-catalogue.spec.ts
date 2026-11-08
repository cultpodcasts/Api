import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import worker from "../src/index";
import { deleteFilm, deleteNewsReport, deleteTvShowEpisode } from "../src/deleteCatalogue";
import {
	DeleteFilmRoute,
	DeleteNewsReportRoute,
	DeleteTvShowEpisodeRoute
} from "../src/openapiRoutes";
import { episodeDeleteBlockedSchema } from "../src/openapiSchemas";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";
import { testEnv as auth0TestEnv } from "./support/honoRoute";

const playableId = "b53e30bb-8afc-44a4-9b2c-d91168743fea";

type JsonContent = {
	description?: string;
	content?: { "application/json"?: { schema?: unknown } };
};

describe("catalogue kind delete proxies", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	const cases = [
		{
			path: `/film/${playableId}`,
			handler: deleteFilm,
			route: DeleteFilmRoute,
			azure: `/api/film/${encodeURIComponent(playableId)}`,
			blockedDescription: /Delete blocked when film is tweeted/
		},
		{
			path: `/newsreport/${playableId}`,
			handler: deleteNewsReport,
			route: DeleteNewsReportRoute,
			azure: `/api/newsreport/${encodeURIComponent(playableId)}`,
			blockedDescription: /Delete blocked when report is tweeted/
		},
		{
			path: `/tvshowepisode/${playableId}`,
			handler: deleteTvShowEpisode,
			route: DeleteTvShowEpisodeRoute,
			azure: `/api/tvshowepisode/${encodeURIComponent(playableId)}`,
			blockedDescription: /Delete blocked when episode is tweeted/
		}
	] as const;

	for (const c of cases) {
		it(`${c.path} DELETE requires admin (401 without a token)`, async () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			const resp = await worker.fetch(
				new Request(`https://api.example${c.path}`, { method: "DELETE" }),
				auth0TestEnv(),
				{} as ExecutionContext
			);
			expect(resp.status).toBe(401);
			expect(fetchMock).not.toHaveBeenCalled();
			expect(c.route.requiresAuth).toBe(true);
			expect(c.route.openApiSchema.security).toEqual([{ bearerAuth: [] }]);
		});

		it(`${c.path} DELETE returns 403 without admin`, async () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			const app = appWithPermissions(c.path.replace(playableId, ":id"), "delete", c.handler, ["curate", "submit"]);
			const resp = await app.request(c.path, { method: "DELETE", headers: authJsonHeaders }, testEnv());
			expect(resp.status).toBe(403);
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it(`${c.path} DELETE proxies to Azure ${c.azure} with 200 empty body`, async () => {
			const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
			vi.stubGlobal("fetch", fetchMock);
			const app = appWithPermissions(c.path.replace(playableId, ":id"), "delete", c.handler, ["admin"]);
			const resp = await app.request(c.path, { method: "DELETE", headers: authJsonHeaders }, testEnv());
			expect(resp.status).toBe(200);
			expect(await resp.text()).toBe("");
			expect(fetchMock).toHaveBeenCalledOnce();
			const [url, init] = fetchMock.mock.calls[0]!;
			expect(String(url)).toContain(c.azure);
			expect((init as RequestInit).method).toBe("DELETE");
		});

		it(`${c.path} DELETE forwards Azure 400 { message, tweeted } and 404`, async () => {
			const blocked = { message: "Cannot delete a tweeted item", tweeted: true };
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(new Response(JSON.stringify(blocked), { status: 400 }))
				.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Not found" }), { status: 404 }));
			vi.stubGlobal("fetch", fetchMock);
			const app = appWithPermissions(c.path.replace(playableId, ":id"), "delete", c.handler, ["admin"]);

			const blockedResp = await app.request(c.path, { method: "DELETE", headers: authJsonHeaders }, testEnv());
			expect(blockedResp.status).toBe(400);
			expect(await blockedResp.json()).toEqual(blocked);

			const missingResp = await app.request(c.path, { method: "DELETE", headers: authJsonHeaders }, testEnv());
			expect(missingResp.status).toBe(404);
			expect(await missingResp.json()).toEqual({ error: "Not found" });
		});

		it(`${c.path} Delete*Route documents admin auth and 200/400 shapes`, () => {
			const schema = c.route.openApiSchema;
			expect(schema.security).toEqual([{ bearerAuth: [] }]);
			expect(schema.description).toMatch(/`admin`/);
			expect(schema.responses?.[403]?.description).toMatch(/without `admin`/);
			const ok = schema.responses?.[200] as JsonContent | undefined;
			expect(ok?.description).toMatch(/empty body/i);
			expect(ok?.content).toBeUndefined();
			const blocked = schema.responses?.[400] as JsonContent | undefined;
			expect(blocked?.description).toMatch(c.blockedDescription);
			expect(blocked?.content?.["application/json"]?.schema).toBe(episodeDeleteBlockedSchema);
			expect(schema.responses?.[404]).toBeDefined();
		});
	}
});
