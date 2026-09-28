import { describe, expect, it } from "vitest";
import { GuidService } from "../src/guid-service";

describe("catalogue short ids", () => {
	const guids = new GuidService();
	const id = "00112233-4455-4677-8899-aabbccddeeff";

	it("keeps omitted kind and Episode equal to toBase64 and decodes with no kind", () => {
		const podcastId = guids.toBase64(id);
		expect(guids.toCatalogueShortId(id)).toBe(podcastId);
		expect(guids.toCatalogueShortId(id, null)).toBe(podcastId);
		expect(guids.toCatalogueShortId(id, undefined)).toBe(podcastId);
		expect(guids.toCatalogueShortId(id, "Episode")).toBe(podcastId);
		expect(guids.parseCatalogueShortId(podcastId)).toEqual({ id, contentKind: null });
	});

	it("encodes a payload whose standard base64 contains + and / as _ and - with no =", () => {
		const mixedId = "003e0000-3f00-0000-0000-000000000000";
		const standard = "AAA+AAA/AAAAAAAAAAAAAA==";
		const encoded = guids.toBase64(mixedId);
		expect(standard).toContain("+");
		expect(standard).toContain("/");
		expect(encoded).toBe(standard.replaceAll("/", "-").replaceAll("+", "_").replaceAll("=", ""));
		expect(encoded).toBe("AAA_AAA-AAAAAAAAAAAAAA");
		expect(encoded).not.toMatch(/[+/=]/);
		expect(guids.toCatalogueShortId(mixedId)).toBe(encoded);
		expect(guids.parseCatalogueShortId(encoded)).toEqual({ id: mixedId, contentKind: null });
	});

	it("round-trips Film, TvShowEpisode, and NewsReport apart from the podcast id", () => {
		const podcastId = guids.toBase64(id);
		for (const kind of ["Film", "TvShowEpisode", "NewsReport"] as const) {
			const encoded = guids.toCatalogueShortId(id, kind);
			expect(encoded).not.toBe(podcastId);
			expect(guids.parseCatalogueShortId(encoded)).toEqual({ id, contentKind: kind });
		}
	});

	it("moves Film, TV, and News onto prefixed paths and leaves Episode unmoved", () => {
		const slug = "current-slug";
		expect(guids.movedPlayablePath(slug, id, "Film")).toBe(
			`/film/${encodeURIComponent(slug)}/${guids.toCatalogueShortId(id, "Film")}`
		);
		expect(guids.movedPlayablePath(slug, id, "TvShowEpisode")).toBe(
			`/tv/${encodeURIComponent(slug)}/${guids.toCatalogueShortId(id, "TvShowEpisode")}`
		);
		expect(guids.movedPlayablePath(slug, id, "NewsReport")).toBe(
			`/news/${encodeURIComponent(slug)}/${guids.toCatalogueShortId(id, "NewsReport")}`
		);
		expect(guids.movedPlayablePath(slug, id, "Episode")).toBeNull();
	});

	it("rejects unknown kinds, including Movie and wrong case, instead of minting a podcast id", () => {
		for (const kind of ["Movie", "film", "movie", "newsreport", ""]) {
			expect(() => guids.toCatalogueShortId(id, kind)).toThrow(
				`Unknown catalogue content kind "${kind}".`
			);
		}
	});
});
