import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("OpenAPI info version", () => {
	it("uses package.json version instead of a hardcoded string", () => {
		const index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
		const packageJson = JSON.parse(
			readFileSync(resolve(process.cwd(), "package.json"), "utf8")
		) as { version: string };

		expect(index).toContain("import packageJson from '../package.json'");
		expect(index).toContain("version: packageJson.version");
		expect(index).not.toMatch(/version:\s*'1\.\d+\.\d+'/);
		expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
