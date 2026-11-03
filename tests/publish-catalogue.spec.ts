import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));
import worker from "../src/index";
import {
	PublishFilmRoute,
	PublishNewsReportRoute,
	PublishTvShowEpisodeRoute
} from "../src/openapiRoutes";
import { publishFilm, publishNewsReport, publishTvShowEpisode } from "../src/publishCatalogue";
import { appWithPermissions, authJsonHeaders, testEnv } from "./honoTestApp";
import { testEnv as auth0TestEnv } from "./support/honoRoute";

const playableId = "b53e30bb-8afc-44a4-9b2c-d91168743fea";

describe("catalogue kind publish proxies", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	const cases = [
		{
			path: `/film/${playableId}/publish`,
			handler: publishFilm,
			route: PublishFilmRoute,
			azure: `/api/film/${encodeURIComponent(playableId)}/publish`
		},
		{
			path: `/newsreport/${playableId}/publish`,
			handler: publishNewsReport,
			route: PublishNewsReportRoute,
			azure: `/api/newsreport/${encodeURIComponent(playableId)}/publish`
		},
		{
			path: `/tvshowepisode/${playableId}/publish`,
			handler: publishTvShowEpisode,
			route: PublishTvShowEpisodeRoute,
			azure: `/api/tvshowepisode/${encodeURIComponent(playableId)}/publish`
		}
	] as const;

	for (const c of cases) {
		it(`${c.path} requires curate (401 without a token)`, async () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			const resp = await worker.fetch(
				new Request(`https://api.example${c.path}`, {
					method: "POST",
					body: "{}",
					headers: { "Content-Type": "application/json" }
				}),
				auth0TestEnv(),
				{} as ExecutionContext
			);
			expect(resp.status).toBe(401);
			expect(fetchMock).not.toHaveBeenCalled();
			expect(c.route.requiresAuth).toBe(true);
			expect(c.route.openApiSchema.security).toEqual([{ bearerAuth: [] }]);
		});

		it(`${c.path} proxies to Azure ${c.azure}`, async () => {
			const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
			vi.stubGlobal("fetch", fetchMock);
			const app = appWithPermissions(c.path.replace(playableId, ":id"), "post", c.handler, ["curate"]);
			const resp = await app.request(
				c.path,
				{
					method: "POST",
					headers: authJsonHeaders,
					body: JSON.stringify({ tweet: true, blueskyPost: true })
				},
				testEnv()
			);
			expect(resp.status).toBe(200);
			expect(fetchMock).toHaveBeenCalledOnce();
			expect(String(fetchMock.mock.calls[0]![0])).toContain(c.azure);
		});
	}
});
