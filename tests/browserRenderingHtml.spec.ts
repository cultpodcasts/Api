import { describe, expect, it } from "vitest";
import { isUsableBrowserHtml } from "../src/browserRenderingHtml";

function padToMinLength(html: string, min = 500): string {
	if (html.length >= min) {
		return html;
	}
	const pad = "x".repeat(min - html.length);
	return html.replace("</body>", `<!--${pad}--></body>`);
}

describe("isUsableBrowserHtml", () => {
	it("rejects HTML shorter than 500 bytes", () => {
		const html =
			'<html><head><meta property="og:title" content="Show" /></head><body>short</body></html>';
		expect(html.length).toBeLessThan(500);
		expect(isUsableBrowserHtml(html)).toBe(false);
	});

	it("accepts long HTML with og:title", () => {
		const html = padToMinLength(
			'<html><head><meta property="og:title" content="Show" /></head><body>content</body></html>'
		);
		expect(isUsableBrowserHtml(html)).toBe(true);
	});

	it("accepts long HTML with __NEXT_DATA__", () => {
		const html = padToMinLength(
			'<html><head></head><body><script id="__NEXT_DATA__" type="application/json">{}</script></body></html>'
		);
		expect(isUsableBrowserHtml(html)).toBe(true);
	});

	it("rejects long HTML with only a bare title", () => {
		const html = padToMinLength(
			"<html><head><title>Just a catalogue page</title></head><body>content</body></html>"
		);
		expect(isUsableBrowserHtml(html)).toBe(false);
	});

	it("rejects Cloudflare challenge pages even with og:title-sized length", () => {
		const html = padToMinLength(
			'<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>'
		);
		expect(isUsableBrowserHtml(html)).toBe(false);
	});

	it("rejects challenge-platform pages that also carry og:title", () => {
		const html = padToMinLength(
			'<html><head><meta property="og:title" content="Wall" /></head><body><div id="challenge-platform"></div></body></html>'
		);
		expect(isUsableBrowserHtml(html)).toBe(false);
	});
});
