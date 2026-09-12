import { afterEach, describe, expect, it, vi } from "vitest";
import { DESKTOP_CHROME_UA } from "../src/browserRenderingHtml";
import { fetchBcVideoApiJson, tryBcVideoIdFromUrl } from "../src/bitchuteVideoPrepare";

/** Matches RPP `ServiceCatalog.IsBcVideoId`: `[A-Za-z0-9_-]{6,}` including hyphen and underscore. */
const hyphenUnderscoreId = "ab-cd_ef";

describe("tryBcVideoIdFromUrl", () => {
	it("accepts /video/ and /embed/ ids with hyphen and underscore", () => {
		expect(tryBcVideoIdFromUrl(new URL(`https://www.bitchute.com/video/${hyphenUnderscoreId}`))).toBe(
			hyphenUnderscoreId
		);
		expect(
			tryBcVideoIdFromUrl(new URL(`https://www.bitchute.com/embed/${hyphenUnderscoreId}/`))
		).toBe(hyphenUnderscoreId);
		expect(tryBcVideoIdFromUrl(new URL(`https://bitchute.com/video/${hyphenUnderscoreId}`))).toBe(
			hyphenUnderscoreId
		);
	});

	it("rejects lookalike hosts, channel paths, extra segments, and short ids", () => {
		expect(
			tryBcVideoIdFromUrl(new URL(`https://evilbitchute.com/video/${hyphenUnderscoreId}`))
		).toBeNull();
		expect(
			tryBcVideoIdFromUrl(new URL(`https://www.bitchute.com/channel/${hyphenUnderscoreId}`))
		).toBeNull();
		expect(
			tryBcVideoIdFromUrl(
				new URL(`https://www.bitchute.com/video/${hyphenUnderscoreId}/extra`)
			)
		).toBeNull();
		expect(tryBcVideoIdFromUrl(new URL("https://www.bitchute.com/video/abcde"))).toBeNull();
	});
});

describe("fetchBcVideoApiJson", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("POSTs the video API with desktop Chrome UA and watch-page Referer", async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			return new Response(JSON.stringify({ video_name: "Episode Title" }), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const messages: string[] = [];
		const json = await fetchBcVideoApiJson(
			new URL(`https://www.bitchute.com/video/${hyphenUnderscoreId}`),
			(message) => messages.push(message)
		);

		expect(json).toContain("Episode Title");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [input, init] = fetchMock.mock.calls[0];
		expect(String(input)).toBe("https://api.bitchute.com/api/beta/video");
		expect(init?.method).toBe("POST");
		const headers = init?.headers as Record<string, string>;
		expect(headers["User-Agent"]).toBe(DESKTOP_CHROME_UA);
		expect(headers.Referer).toBe(`https://www.bitchute.com/video/${hyphenUnderscoreId}/`);
		expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({ video_id: hyphenUnderscoreId });
		expect(messages.some((m) => m.includes("status=200"))).toBe(true);
	});
});
