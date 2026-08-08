import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-contract checks for GET /languages (admin or curate via hasPermission).
 */
describe("get-languages contract", () => {
	const src = readFileSync(resolve(process.cwd(), "src/getLanguages.ts"), "utf8");
	const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");

	it("registers GET /languages", () => {
		expect(index).toContain("openapi.get('/languages', GetLanguagesRoute)");
	});

	it("allows admin or curate via hasPermission without requiring permissions claim", () => {
		expect(src).toContain("hasPermission(auth0Payload, 'curate')");
		expect(src).toContain("hasPermission(auth0Payload, 'admin')");
		expect(src).not.toContain("auth0Payload?.permissions &&");
		expect(src).not.toContain("permissions.includes");
	});
});
