import { describe, expect, it } from "vitest";
import { brandLogoDataUrl } from "../src/ogBrandLogo";

describe("brandLogoDataUrl", () => {
	it("exposes the site mark as an SVG data URL", () => {
		const url = brandLogoDataUrl();
		expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
		const svg = atob(url.replace("data:image/svg+xml;base64,", ""));
		expect(svg).toContain("#FCFFFF");
		expect(svg).toContain("viewBox=");
	});
});
