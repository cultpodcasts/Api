import { describe, expect, it } from "vitest";
import { AllowedOrigins } from "../src/AllowedOrigins";
import { corsOptions } from "../src/corsOptions";
import { getOrigin } from "../src/getOrigin";

describe("CORS allowHeaders", () => {
	it("allows admin cache-control/pragma and excludes ngsw-bypass", () => {
		expect(corsOptions.allowHeaders).toEqual(
			expect.arrayContaining(["content-type", "authorization", "cache-control", "pragma"])
		);
		expect(corsOptions.allowHeaders).not.toContain("ngsw-bypass");
	});
});

describe("CORS allowlist (getOrigin)", () => {
	it("keeps an allowlisted origin", () => {
		expect(getOrigin("https://local.cultpodcasts.com:8788", ".pages.dev")).toBe(
			"https://local.cultpodcasts.com:8788"
		);
	});

	it("rewrites unknown origins to production", () => {
		expect(getOrigin("https://evil.example", ".pages.dev")).toBe(AllowedOrigins[0]);
	});

	it("allows staging host suffix", () => {
		expect(getOrigin("https://preview.pages.dev", ".pages.dev")).toBe(
			"https://preview.pages.dev"
		);
	});

	it("allows comma-separated staging host suffixes", () => {
		expect(
			getOrigin(
				"https://feat-hero.flix-ac4.pages.dev",
				"website-83e.pages.dev,flix-ac4.pages.dev"
			)
		).toBe("https://feat-hero.flix-ac4.pages.dev");
	});

	it("allows flix prototype origin", () => {
		expect(getOrigin("https://flix.cultpodcasts.com", ".pages.dev")).toBe(
			"https://flix.cultpodcasts.com"
		);
	});

	it("treats null origin as production", () => {
		expect(getOrigin(null, ".pages.dev")).toBe(AllowedOrigins[0]);
	});
});
