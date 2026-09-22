import { afterEach, describe, expect, it, vi } from "vitest";
import scrapeUsWorker from "../workers/streaming-scrape-us/src/index";

const { fetchCatalogHtml } = vi.hoisted(() => ({
	fetchCatalogHtml: vi.fn()
}));

vi.mock("../src/catalogHtmlPrepare", () => ({
	fetchCatalogHtml
}));

describe("streaming-scrape-us Worker", () => {
	afterEach(() => {
		fetchCatalogHtml.mockReset();
	});

	it("rejects browserRendering mode with 422 (geo uses directHttp only)", async () => {
		const resp = await scrapeUsWorker.fetch(
			new Request("https://scrape.internal/", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					url: "https://www.hulu.com/series/x",
					mode: "browserRendering",
					service: "hulu"
				})
			}),
			{}
		);
		expect(resp.status).toBe(422);
		const body = (await resp.json()) as { ok: boolean; error: string };
		expect(body.ok).toBe(false);
		expect(body.error).toMatch(/browserRendering is not supported/i);
		expect(fetchCatalogHtml).not.toHaveBeenCalled();
	});

	it("fetches catalogue HTML with directHttp", async () => {
		fetchCatalogHtml.mockResolvedValueOnce("<html>" + "x".repeat(500) + "</html>");
		const resp = await scrapeUsWorker.fetch(
			new Request("https://scrape.internal/", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					url: "https://www.hulu.com/series/x",
					mode: "directHttp",
					service: "hulu"
				})
			}),
			{}
		);
		expect(resp.status).toBe(200);
		const body = (await resp.json()) as { ok: boolean; html?: string };
		expect(body.ok).toBe(true);
		expect(body.html?.length).toBeGreaterThan(400);
		expect(fetchCatalogHtml).toHaveBeenCalledOnce();
	});
});
