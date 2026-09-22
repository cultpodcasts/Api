import { afterEach, describe, expect, it, vi } from "vitest";
import { DESKTOP_CHROME_UA } from "../src/browserRenderingHtml";
import {
	CATALOG_HTML_TIMEOUT_MS,
	fetchCatalogHtml,
	titleFromCatalogHtml
} from "../src/catalogHtmlPrepare";

const catalogUrl = new URL("https://tubitv.com/en-au/movies/1/example-slug");

function responseWithUrl(body: string, status: number, url: string): Response {
	const resp = new Response(body, { status });
	Object.defineProperty(resp, "url", { value: url, configurable: true });
	return resp;
}

describe("fetchCatalogHtml", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("GETs url.toString() with desktop Chrome UA and 12s timeout", async () => {
		const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
		const fetchMock = vi.fn(async () => {
			return responseWithUrl(
				"<html><head><title>Film</title></head><body>ok</body></html>",
				200,
				catalogUrl.toString()
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		const messages: string[] = [];
		const result = await fetchCatalogHtml(catalogUrl, (message) => messages.push(message));

		expect(result?.html).toContain("Film");
		expect(result?.finalUrl).toBe(catalogUrl.toString());
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
			vi.fn(async () => responseWithUrl(titleOnly, 200, catalogUrl.toString()))
		);

		const result = await fetchCatalogHtml(catalogUrl, () => undefined);

		expect(result?.html).toBe(titleOnly);
		expect(result?.html).not.toMatch(/og:title/i);
	});

	it("reports Response.url as finalUrl after redirect follow", async () => {
		const redirectTarget =
			"https://www.peacocktv.com/signin?return=%2Fwatch-online%2Fmovies%2Fx";
		const html =
			"<html><head><title>Peacock</title></head><body>" + "x".repeat(500) + "</body></html>";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => responseWithUrl(html, 200, redirectTarget))
		);

		const messages: string[] = [];
		const result = await fetchCatalogHtml(catalogUrl, (message) => messages.push(message));

		expect(result).not.toBeNull();
		expect(result!.finalUrl).toBe(redirectTarget);
		expect(result!.html).toContain("Peacock");
		expect(messages.some((m) => m.includes(`finalUrl=${redirectTarget}`))).toBe(true);
	});

	it("returns null when the catalogue GET is not ok", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => responseWithUrl("forbidden", 403, catalogUrl.toString()))
		);

		const messages: string[] = [];
		const result = await fetchCatalogHtml(catalogUrl, (message) => messages.push(message));

		expect(result).toBeNull();
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
		const result = await fetchCatalogHtml(catalogUrl, (message) => messages.push(message));

		expect(result).toBeNull();
		expect(messages.some((m) => m.includes("catalog html failed: network down"))).toBe(true);
	});

	it("returns null for challenge / interstitial HTML", async () => {
		const challenge =
			"<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => responseWithUrl(challenge, 200, catalogUrl.toString()))
		);

		const messages: string[] = [];
		const result = await fetchCatalogHtml(catalogUrl, (message) => messages.push(message));

		expect(result).toBeNull();
		expect(messages.some((m) => m.includes("catalog html challenge"))).toBe(true);
	});
});

describe("titleFromCatalogHtml", () => {
	it("prefers og:title over document title", () => {
		const html =
			'<html><head><title>Doc</title><meta property="og:title" content="OG Film" /></head></html>';
		expect(titleFromCatalogHtml(html)).toBe("OG Film");
	});

	it("falls back to document title", () => {
		expect(titleFromCatalogHtml("<html><head><title> Doc Title </title></head></html>")).toBe(
			"Doc Title"
		);
	});
});
