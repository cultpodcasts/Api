import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { launchMock } = vi.hoisted(() => ({
	launchMock: vi.fn()
}));

vi.mock("@cloudflare/puppeteer", () => ({
	default: {
		launch: launchMock
	}
}));

import { HARD_CAP_MS, fetchHtmlWithBrowserRendering } from "../src/browserRenderingHtml";

describe("fetchHtmlWithBrowserRendering hard-cap deadline", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		launchMock.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("clears the hard-cap timer when run completes quickly", async () => {
		const close = vi.fn(async () => undefined);
		const page = {
			on: vi.fn(),
			goto: vi.fn(async () => undefined),
			title: vi.fn(async () => "Show"),
			content: vi.fn(
				async () =>
					'<html><head><meta property="og:title" content="Show" /></head><body>ok</body></html>'
			),
			url: vi.fn(() => "https://example.test/ep")
		};
		launchMock.mockResolvedValue({
			newPage: vi.fn(async () => page),
			close
		});

		const resultPromise = fetchHtmlWithBrowserRendering({} as never, "https://example.test/ep");
		// Allow launch/goto microtasks; settle uses real setTimeout (1.5s).
		await vi.advanceTimersByTimeAsync(2_000);
		const result = await resultPromise;

		expect(result.diagnostics.gotoError).toBeUndefined();
		expect(result.diagnostics.marks.some((m) => m.label === "goto_ok")).toBe(true);
		// Hard-cap timer must have been cleared — only settle/salvage timers gone.
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(HARD_CAP_MS + 5_000);
		expect(result.diagnostics.gotoError).toBeUndefined();
	});

	it("salvages on hard-cap and swallows a late run rejection", async () => {
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => {
			unhandled.push(reason);
		};
		process.on("unhandledRejection", onUnhandled);

		try {
			let rejectGoto!: (err: Error) => void;
			const gotoHang = new Promise<never>((_, reject) => {
				rejectGoto = reject;
			});
			const close = vi.fn(async () => undefined);
			const page = {
				on: vi.fn(),
				goto: vi.fn(() => gotoHang),
				title: vi.fn(async () => "Partial"),
				content: vi.fn(
					async () =>
						'<html><head><meta property="og:title" content="Partial" /></head><body>partial</body></html>'
				),
				url: vi.fn(() => "https://example.test/hang")
			};
			launchMock.mockResolvedValue({
				newPage: vi.fn(async () => page),
				close
			});

			const resultPromise = fetchHtmlWithBrowserRendering(
				{} as never,
				"https://example.test/hang"
			);
			await Promise.resolve();
			await vi.advanceTimersByTimeAsync(HARD_CAP_MS);
			const result = await resultPromise;

			expect(result.diagnostics.gotoError).toBe(`hardCap ${HARD_CAP_MS}ms exceeded`);
			expect(result.diagnostics.marks.some((m) => m.label === "hard_cap")).toBe(true);
			expect(result.html).toContain("og:title");

			const marksSnapshot = [...result.diagnostics.marks];
			rejectGoto(new Error("Target closed"));
			await Promise.resolve();
			await vi.advanceTimersByTimeAsync(5_000);
			await Promise.resolve();

			expect(unhandled).toEqual([]);
			expect(vi.getTimerCount()).toBe(0);
			// Loser `run()` must not mutate diagnostics.marks after hard-cap return.
			expect(result.diagnostics.marks).toEqual(marksSnapshot);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});
});
