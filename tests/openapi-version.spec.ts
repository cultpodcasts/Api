import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import { openApiDocumentVersion, openApiInfoForEnvironment } from "../src/apiEnvironment";

describe("OpenAPI info version", () => {
	it("uses the package.json version at runtime", () => {
		expect(openApiDocumentVersion).toBe(packageJson.version);
		expect(openApiDocumentVersion).toMatch(/^\d+\.\d+\.\d+$/);
		expect(openApiInfoForEnvironment("production", openApiDocumentVersion).version).toBe(
			packageJson.version
		);
	});
});
