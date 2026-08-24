import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("GET /og-image OpenAPI", () => {
	const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
	const routes = readFileSync(resolve(process.cwd(), "src/openapiRoutes.ts"), "utf8");

	it("registers GET /og-image on the OpenAPI router, not a bare Hono route", () => {
		expect(index).toContain("openapi.get('/og-image', GetOgShareImageRoute)");
		expect(index).not.toContain("app.get('/og-image'");
	});

	it("documents query contract and PNG / redirect responses", () => {
		expect(routes).toContain("export const GetOgShareImageRoute");
		expect(routes).toContain("request: { query: ogImageQuerySchema }");
		expect(routes).toContain('"image/png"');
		expect(routes).toContain("307:");
	});
});
