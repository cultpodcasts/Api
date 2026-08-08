import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-contract checks for /supported-languages (admin GET/POST/DELETE + cultures).
 */
describe("supported-languages contract", () => {
	const src = readFileSync(resolve(process.cwd(), "src/supportedLanguages.ts"), "utf8");
	const routes = readFileSync(resolve(process.cwd(), "src/openapiRoutes.ts"), "utf8");
	const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");

	it("registers GET/POST/DELETE and cultures routes; no PUT or /terms", () => {
		expect(index).toContain("openapi.get('/supported-languages', GetSupportedLanguagesRoute)");
		expect(index).toContain("openapi.get('/supported-languages/cultures', GetNeutralCulturesRoute)");
		expect(index).toContain("openapi.post('/supported-languages', PostSupportedLanguagesRoute)");
		expect(index).toContain("openapi.delete('/supported-languages/:code', DeleteSupportedLanguagesRoute)");
		expect(index).not.toMatch(/openapi\.put\('\/supported-languages/);
		expect(index).not.toContain("'/terms'");
		expect(index).not.toContain('"/terms"');
	});

	it("route factories require Auth0 middleware", () => {
		const getBlock = routes.match(
			/export const GetSupportedLanguagesRoute = createOpenApiRoute\(getSupportedLanguages, \{[\s\S]*?\n\}\);/
		)?.[0];
		const culturesBlock = routes.match(
			/export const GetNeutralCulturesRoute = createOpenApiRoute\(getNeutralCultures, \{[\s\S]*?\n\}\);/
		)?.[0];
		const postBlock = routes.match(
			/export const PostSupportedLanguagesRoute = createOpenApiRoute\(postSupportedLanguages, \{[\s\S]*?\n\}\);/
		)?.[0];
		const deleteBlock = routes.match(
			/export const DeleteSupportedLanguagesRoute = createOpenApiRoute\(deleteSupportedLanguages, \{[\s\S]*?\n\}\);/
		)?.[0];
		expect(getBlock).toBeDefined();
		expect(culturesBlock).toBeDefined();
		expect(postBlock).toBeDefined();
		expect(deleteBlock).toBeDefined();
		expect(getBlock).toContain("auth: true");
		expect(culturesBlock).toContain("auth: true");
		expect(postBlock).toContain("auth: true");
		expect(deleteBlock).toContain("auth: true");
	});

	it("handlers require admin permission and no-store cache headers", () => {
		expect(src).toContain('permission: "admin"');
		expect(src).not.toContain('permission: "curate"');
		expect(src).toContain("omitCacheControlHeader: true");
		expect(src).toContain('c.header("Cache-Control", "no-store")');
		expect(src.match(/permission: "admin"/g)?.length).toBe(4);
		expect(src.match(/Cache-Control", "no-store"/g)?.length).toBe(4);
	});

	it("does not register PUT handlers for supported-languages", () => {
		expect(src).not.toMatch(/\bputSupportedLanguages\b/i);
		expect(src).not.toContain('method: "PUT"');
		expect(routes).not.toMatch(/PutSupportedLanguages/);
	});
});
