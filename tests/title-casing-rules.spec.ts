import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-contract checks for /title-casing-rules/:language and term delta routes.
 */
describe("title-casing-rules contract", () => {
	const src = readFileSync(resolve(process.cwd(), "src/titleCasingRules.ts"), "utf8");
	const routes = readFileSync(resolve(process.cwd(), "src/openapiRoutes.ts"), "utf8");
	const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");

	it("registers language GET plus lower-case and known-terms POST/DELETE; no PUT or /terms", () => {
		expect(index).toContain(
			"openapi.get('/title-casing-rules/:language', GetTitleCasingRulesByLanguageRoute)"
		);
		expect(index).toContain(
			"openapi.post('/title-casing-rules/:language/lower-case-terms', PostTitleCasingRulesLowerCaseTermRoute)"
		);
		expect(index).toContain(
			"openapi.delete('/title-casing-rules/:language/lower-case-terms/:term', DeleteTitleCasingRulesLowerCaseTermRoute)"
		);
		expect(index).toContain(
			"openapi.post('/title-casing-rules/:language/known-terms', PostTitleCasingRulesKnownTermRoute)"
		);
		expect(index).toContain(
			"openapi.delete('/title-casing-rules/:language/known-terms/:literal', DeleteTitleCasingRulesKnownTermRoute)"
		);
		expect(index).toContain(
			"openapi.post('/title-casing-rules/:language/ignored-subjects', PostTitleCasingRulesIgnoredSubjectRoute)"
		);
		expect(index).toContain(
			"openapi.delete('/title-casing-rules/:language/ignored-subjects/:term', DeleteTitleCasingRulesIgnoredSubjectRoute)"
		);
		expect(index).not.toMatch(/openapi\.put\('\/title-casing-rules/);
		expect(index).not.toMatch(/openapi\.get\('\/title-casing-rules'/);
		expect(index).not.toContain("'/terms'");
		expect(index).not.toContain('"/terms"');
	});

	it("route factories require Auth0 middleware", () => {
		const getBlock = routes.match(
			/export const GetTitleCasingRulesByLanguageRoute = createOpenApiRoute\(getTitleCasingRulesByLanguage, \{[\s\S]*?\n\}\);/
		)?.[0];
		const postLower = routes.match(
			/export const PostTitleCasingRulesLowerCaseTermRoute = createOpenApiRoute\(postTitleCasingRulesLowerCaseTerm, \{[\s\S]*?\n\}\);/
		)?.[0];
		const deleteLower = routes.match(
			/export const DeleteTitleCasingRulesLowerCaseTermRoute = createOpenApiRoute\(deleteTitleCasingRulesLowerCaseTerm, \{[\s\S]*?\n\}\);/
		)?.[0];
		const postKnown = routes.match(
			/export const PostTitleCasingRulesKnownTermRoute = createOpenApiRoute\(postTitleCasingRulesKnownTerm, \{[\s\S]*?\n\}\);/
		)?.[0];
		const deleteKnown = routes.match(
			/export const DeleteTitleCasingRulesKnownTermRoute = createOpenApiRoute\(deleteTitleCasingRulesKnownTerm, \{[\s\S]*?\n\}\);/
		)?.[0];
		const postIgnored = routes.match(
			/export const PostTitleCasingRulesIgnoredSubjectRoute = createOpenApiRoute\(postTitleCasingRulesIgnoredSubject, \{[\s\S]*?\n\}\);/
		)?.[0];
		const deleteIgnored = routes.match(
			/export const DeleteTitleCasingRulesIgnoredSubjectRoute = createOpenApiRoute\(deleteTitleCasingRulesIgnoredSubject, \{[\s\S]*?\n\}\);/
		)?.[0];
		expect(getBlock).toBeDefined();
		expect(postLower).toBeDefined();
		expect(deleteLower).toBeDefined();
		expect(postKnown).toBeDefined();
		expect(deleteKnown).toBeDefined();
		expect(postIgnored).toBeDefined();
		expect(deleteIgnored).toBeDefined();
		for (const block of [getBlock, postLower, deleteLower, postKnown, deleteKnown, postIgnored, deleteIgnored]) {
			expect(block).toContain("auth: true");
		}
	});

	it("handlers require admin permission and no-store cache headers", () => {
		expect(src).toContain('permission: "admin"');
		expect(src).not.toContain('permission: "curate"');
		expect(src).toContain("omitCacheControlHeader: true");
		expect(src).toContain('c.header("Cache-Control", "no-store")');
		expect(src.match(/permission: "admin"/g)?.length).toBe(7);
		expect(src.match(/Cache-Control", "no-store"/g)?.length).toBe(7);
	});

	it("does not register PUT handlers for title-casing-rules", () => {
		expect(src).not.toMatch(/\bputTitleCasingRules\b/i);
		expect(src).not.toContain('method: "PUT"');
		expect(routes).not.toMatch(/PutTitleCasingRules/);
	});
});
