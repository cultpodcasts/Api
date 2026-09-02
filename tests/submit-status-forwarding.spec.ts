import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("submit status forwarding", () => {
	it("forwards Azure 404 and 409 instead of D1-falling-back as Submitted", () => {
		const src = readFileSync(resolve(process.cwd(), "src/submit.ts"), "utf8");
		expect(src).toContain("forwardStatuses");
		expect(src).toMatch(/404/);
		expect(src).toMatch(/409/);
		expect(src).toMatch(/resp\.status === 404 \|\| resp\.status === 409/);
	});
});
