import { describe, expect, it } from "vitest";
import { AllowedOrigins } from "../src/AllowedOrigins";
import { getOrigin } from "../src/getOrigin";

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

	it("treats null origin as production", () => {
		expect(getOrigin(null, ".pages.dev")).toBe(AllowedOrigins[0]);
	});
});
