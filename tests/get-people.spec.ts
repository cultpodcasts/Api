import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("getPeople", () => {
	it("does not HTTP-cache the curator people list", () => {
		const src = readFileSync(resolve(process.cwd(), "src/getPeople.ts"), "utf8");
		expect(src).toContain("omitCacheControlHeader: true");
		expect(src).toContain('c.header("Cache-Control", "no-store")');
		expect(src.match(/Cache-Control", "no-store"/g)?.length).toBe(2);
		expect(src).not.toMatch(/etag:\s*object\.httpEtag/);
	});

	it("emits structured Workers Logs events instead of prose messages", () => {
		const src = readFileSync(resolve(process.cwd(), "src/getPeople.ts"), "utf8");
		expect(src).toContain('event: "people.r2_hit"');
		expect(src).toContain('outcome: "success"');
		expect(src).toContain('route: "getPeople"');
		expect(src).toContain(".emit(");
		expect(src).not.toContain("addMessage(");
	});
});
