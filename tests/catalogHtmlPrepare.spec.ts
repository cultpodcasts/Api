import { afterEach, describe, expect, it, vi } from "vitest";
import { DESKTOP_CHROME_UA } from "../src/browserRenderingHtml";
import { CATALOG_HTML_TIMEOUT_MS, fetchCatalogHtml } from "../src/catalogHtmlPrepare";

const catalogUrl = new URL("https://tubitv.com/en-au/movies/1/example-slug");

describe("fetchCatalogHtml", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("GETs url.toString() with desktop Chrome UA and 12s timeout", async () => {
		const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
		const fetchMock = vi.fn(async () => {
			return new Response("<html><head><title>Film</title></head><body>ok</body></html>", {
				status: 200
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const messages: string[] = [];
		const html = await fetchCatalogHtml(catalogUrl, (message) => messages.push(message));

		expect(html).toContain("Film");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [input, init] = fetchMock.mock.calls[0];
		expect(String(input)).toBe(catalogUrl.toString());
		expect(init?.method ?? "GET").toBe("GET");
		const headers = init?.headers as Record<string, string>;
		expect(headers["User-Agent"]).toBe(DESKTOP_CHROME_UA);
		expect(timeoutSpy).toHaveBeenCalledWith(12_000);
		expect(CATALOG_HTML_TIMEOUT_MS).toBe(12_000);
		expect(messages.some((m) => m.includes("status=200"))).toBe(true);
	});

	it("returns title-only HTML with no og:title", async () => {
		const titleOnly =
			"<html><head><title>Film</title></head><body>catalogue page without og tags</body></html>";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(titleOnly, { status: 200 }))
		);

		const html = await fetchCatalogHtml(catalogUrl, () => undefined);

		expect(html).toBe(titleOnly);
		expect(html).not.toMatch(/og:title/i);
	});

	it("returns null when the catalogue GET is not ok", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("forbidden", { status: 403 })));

		const messages: string[] = [];
		const html = await fetchCatalogHtml(catalogUrl, (message) => messages.push(message));

		expect(html).toBeNull();
		expect(messages.some((m) => m.includes("status=403"))).toBe(true);
	});

	it("returns null when fetch throws", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network down");
			})
		);

		const messages: string[] = [];
		const html = await fetchCatalogHtml(catalogUrl, (message) => messages.push(message));

		expect(html).toBeNull();
		expect(messages.some((m) => m.includes("catalog html failed: network down"))).toBe(true);
	});

	it("returns null for challenge / interstitial HTML", async () => {
		const challenge =
			"<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>";
		vi.stubGlobal("fetch", vi.fn(async () => new Response(challenge, { status: 200 })));

		const messages: string[] = [];
		const html = await fetchCatalogHtml(catalogUrl, (message) => messages.push(message));

		expect(html).toBeNull();
		expect(messages.some((m) => m.includes("catalog html challenge"))).toBe(true);
	});
});
