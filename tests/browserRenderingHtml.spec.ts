import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUsableBrowserHtml, raceWithTimeout } from "../src/browserRenderingHtml";

function padToMinLength(html: string, min = 500): string {
	if (html.length >= min) {
		return html;
	}
	const pad = "x".repeat(min - html.length);
	return html.replace("</body>", `<!--${pad}--></body>`);
}

describe("raceWithTimeout", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns the primary value and clears the fallback timer", async () => {
		let resolvePrimary!: (value: string) => void;
		const primary = new Promise<string>((resolve) => {
			resolvePrimary = resolve;
		});
		const raced = raceWithTimeout(primary, 5_000, "fallback");
		resolvePrimary("ok");
		await expect(raced).resolves.toBe("ok");
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(10_000);
		await expect(raced).resolves.toBe("ok");
	});

	it("returns the fallback when the primary stays pending", async () => {
		const primary = new Promise<string>(() => {
			/* never settles */
		});
		const raced = raceWithTimeout(primary, 1_000, "fallback");
		const assertion = expect(raced).resolves.toBe("fallback");
		await vi.advanceTimersByTimeAsync(1_000);
		await assertion;
		expect(vi.getTimerCount()).toBe(0);
	});

	it("returns the fallback when the primary rejects", async () => {
		const primary = Promise.reject(new Error("boom"));
		const raced = raceWithTimeout(primary, 5_000, "fallback");
		await expect(raced).resolves.toBe("fallback");
		expect(vi.getTimerCount()).toBe(0);
	});
});

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
