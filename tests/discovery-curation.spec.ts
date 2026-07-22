import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("discovery-curation status forwarding", () => {
	it("submitDiscovery forwards Azure 4xx instead of opaque 500-only", () => {
		const src = readFileSync(resolve(process.cwd(), "src/submitDiscovery.ts"), "utf8");
		expect(src).toContain("forwardStatuses");
		expect(src).toContain("proxyToAzure");
		expect(src).toMatch(/400/);
	});

	it("getDiscoveryReports forwards Azure 4xx", () => {
		const src = readFileSync(resolve(process.cwd(), "src/getDiscoveryReports.ts"), "utf8");
		expect(src).toContain("forwardStatuses");
		expect(src).toContain("proxyToAzure");
	});
});
